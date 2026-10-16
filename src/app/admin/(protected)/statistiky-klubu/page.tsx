import Link from "next/link";
import { BarList, ColumnChart, everyNth, monthName, nightColumns, StatTile, type Column } from "@/components/admin/stat-charts";
import { Button, Card, inputClass } from "@/components/ui";
import { attendanceAffiliations } from "@/db/schema";
import { getDict } from "@/i18n/server";
import { requireAccess } from "@/lib/admin-auth";
import { academicYearStart, addDays, attendanceDay, dayDate, listNights, parseDay, summarize } from "@/lib/attendance";
import { ARRIVAL_STEP, attendanceStats, loanStats } from "@/lib/club-stats";
import { formatShortDate } from "@/lib/time";

type Params = { od?: string; do?: string };

const buttonClass = "select-none rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-accent";
const linkClass = "select-none text-sm font-medium text-accent hover:underline";

/**
 * Admin → Klub → Statistiky: the club's numbers for a period (this academic year by default) – the attendance sheet
 * (nights, people, newcomers, weekdays, how often, arrivals, by affiliation, each night, the CSV) and the loans (how
 * many, how long, the most borrowed games, by month).
 */
export default async function ClubStatsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAccess("club");
  const params = await searchParams;
  const today = attendanceDay();
  const yearStart = academicYearStart(today);
  let from = parseDay(params.od) ?? yearStart;
  let to = parseDay(params.do) ?? today;
  if (from > to) [from, to] = [to, from];
  const [{ locale, t }, sum, nights, att, loans] = await Promise.all([getDict(), summarize(from, to), listNights(from, to), attendanceStats(from, to), loanStats(from, to)]);
  const s = t.admin.clubStats;
  const a = t.admin.attendance;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  // 7 January 2024 was a Sunday
  const weekday = (w: number) => {
    const name = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(dayDate(addDays("2024-01-07", w)));
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  const clock = (minute: number) => `${Math.floor(minute / 60) % 24}:${String(minute % 60).padStart(2, "0")}`;

  const presets = [
    { label: s.presets.year, from: yearStart, to: today },
    { label: s.presets.lastYear, from: academicYearStart(addDays(yearStart, -1)), to: addDays(yearStart, -1) },
    { label: s.presets.days90, from: addDays(today, -89), to: today },
    { label: s.presets.all, from: "2000-01-01", to: today },
  ];

  const hourStep = everyNth(att.arrivals.length / 2, 7);
  const arrivalColumns: Column[] = att.arrivals.map((x) => ({
    key: String(x.minute),
    value: x.people,
    label: `${clock(x.minute)}–${clock(x.minute + ARRIVAL_STEP)}`,
    tick: x.minute % 60 === 0 && (x.minute / 60) % hourStep === 0 ? clock(x.minute) : undefined,
  }));
  const loanStep = everyNth(loans.months.length, 8);
  const monthColumns: Column[] = loans.months.map((m, i) => ({ key: m.month, value: m.loans, label: monthName(m.month, locale, "long"), tick: i % loanStep === 0 ? monthName(m.month, locale, "short") : undefined }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{s.title}</h1>
        <p className="max-w-3xl text-sm text-muted">{s.intro}</p>
      </div>

      {/* the period: everything below counts in it */}
      <div className="flex flex-col gap-3" data-testid="club-stats-period">
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const current = p.from === from && p.to === to;
            return (
              <Link
                key={p.label}
                href={p.from === yearStart && p.to === today ? "/admin/statistiky-klubu" : `/admin/statistiky-klubu?od=${p.from}&do=${p.to}`}
                aria-current={current ? "page" : undefined}
                className={current ? `${buttonClass} border-accent font-medium text-accent` : buttonClass}
              >
                {p.label}
              </Link>
            );
          })}
        </div>
        <form action="/admin/statistiky-klubu" className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="font-medium">{a.from}</span>
            <input name="od" type="date" defaultValue={from} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">{a.to}</span>
            <input name="do" type="date" defaultValue={to} className={inputClass} />
          </label>
          <Button type="submit" variant="secondary">{a.show}</Button>
        </form>
      </div>

      <Card className="flex flex-col gap-5" id="prezence">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">{s.attendance}</h2>
          <Link href="/admin/prezence" className={linkClass}>{s.toAttendance}</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="club-stats-attendance">
          <StatTile label={s.nights} value={sum.nights} />
          <StatTile label={s.visits} value={sum.visits} />
          <StatTile label={s.people} value={sum.people} />
          <StatTile label={s.average} value={sum.nights ? number.format(sum.visits / sum.nights) : "–"} />
          <StatTile
            label={s.busiest}
            value={att.busiest?.people ?? "–"}
            note={att.busiest && formatShortDate(dayDate(att.busiest.day), locale)}
          />
          <StatTile label={s.newcomers} value={att.newcomers} note={s.newcomersNote} />
        </div>

        {nights.length === 0 ? (
          <p className="text-muted">{s.noAttendance}</p>
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">{s.perNight}</h3>
              <ColumnChart data={nightColumns(nights, locale)} unit={s.peopleN} label={s.perNight} values testId="club-stats-nights-chart" />
            </section>

            <div className="grid gap-6 sm:grid-cols-2">
              <section className="flex flex-col gap-2">
                <h3 className="font-semibold">{s.byWeekday}</h3>
                <BarList
                  data={att.weekdays.map((w) => ({ key: String(w.weekday), label: weekday(w.weekday), value: w.average, note: s.weekdayNights(w.nights) }))}
                  format={(n) => number.format(n)}
                  testId="club-stats-weekdays"
                />
              </section>
              <section className="flex flex-col gap-2">
                <h3 className="font-semibold">{s.howOften}</h3>
                <p className="-mt-1 text-xs text-muted">{s.howOftenHint}</p>
                <BarList
                  data={att.visitBins.map((b) => ({ key: String(b.least), label: s.visitBin(b.least, b.most), value: b.people }))}
                  testId="club-stats-how-often"
                />
              </section>
            </div>

            {arrivalColumns.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="font-semibold">{s.arrivals}</h3>
                <p className="-mt-1 text-xs text-muted">{s.arrivalsHint}</p>
                <ColumnChart data={arrivalColumns} unit={s.peopleN} label={s.arrivals} testId="club-stats-arrivals" />
              </section>
            )}

            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">{s.byAffiliation}</h3>
              <div className="overflow-x-auto">
                <table className="text-left text-sm" data-testid="attendance-summary">
                  <thead className="text-muted">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-6 font-medium">{a.nightsCount(sum.nights)}</th>
                      <th className="py-2 pr-6 text-right font-medium">{a.visits}</th>
                      <th className="py-2 text-right font-medium">{a.uniquePeople}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceAffiliations.map((af) => (
                      <tr key={af} className="border-b border-border">
                        <td className="py-1.5 pr-6">{a.affiliations[af]}</td>
                        <td className="py-1.5 pr-6 text-right tabular-nums">{sum.visitsBy[af]}</td>
                        <td className="py-1.5 text-right tabular-nums">{sum.peopleBy[af]}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-1.5 pr-6">{a.total}</td>
                      <td className="py-1.5 pr-6 text-right tabular-nums">{sum.visits}</td>
                      <td className="py-1.5 text-right tabular-nums">{sum.people}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted">{a.peopleNote}</p>
            </section>

            <details data-testid="attendance-nights-list">
              <summary className="cursor-pointer font-semibold">{s.nightsTable(nights.length)}</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-sm" data-testid="attendance-nights">
                  <thead className="text-muted">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-medium" />
                      <th className="py-2 pr-3 text-right font-medium">{a.total}</th>
                      {attendanceAffiliations.map((af) => (
                        <th key={af} className="py-2 pr-3 text-right font-medium">{a.affiliations[af]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {nights.map((n) => (
                      <tr key={n.day} className="border-b border-border last:border-0">
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          <Link href={`/admin/prezence?den=${n.day}#vecer`} className={linkClass}>
                            {formatShortDate(dayDate(n.day), locale)}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">{n.total}</td>
                        {attendanceAffiliations.map((af) => (
                          <td key={af} className="py-1.5 pr-3 text-right tabular-nums">{n.byAffiliation[af] || "–"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}

        <div>
          <a href={`/admin/prezence/export.csv?od=${from}&do=${to}`} className={buttonClass} data-testid="attendance-csv">
            {a.downloadCsv}
          </a>
        </div>
      </Card>

      <Card className="flex flex-col gap-5" id="pujcovna">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">{s.loans}</h2>
          <Link href="/admin/pujcovna" className={linkClass}>{s.toLoans}</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="club-stats-loans">
          <StatTile label={s.loansCount} value={loans.loans} />
          <StatTile label={s.loanGames} value={loans.games} />
          <StatTile
            label={s.averageDays}
            value={loans.averageDays === null ? "–" : s.days(Number.isInteger(loans.averageDays) ? loans.averageDays : number.format(loans.averageDays))}
            note={s.averageDaysNote}
          />
          <StatTile
            label={s.openNow}
            value={loans.openNow}
            note={loans.longestOut && s.longestOut(loans.longestOut.game, s.days(loans.longestOut.days))}
          />
        </div>

        {loans.loans === 0 ? (
          <p className="text-muted">{s.noLoans}</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">{s.topGames}</h3>
              <BarList data={loans.top.map((g) => ({ key: g.name, label: g.name, value: g.loans }))} stacked testId="club-stats-top-games" />
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">{s.perMonth}</h3>
              <ColumnChart data={monthColumns} unit={s.loansN} label={s.perMonth} testId="club-stats-months" />
            </section>
          </div>
        )}
      </Card>
    </div>
  );
}
