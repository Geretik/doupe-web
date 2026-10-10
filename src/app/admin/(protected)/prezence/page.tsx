import Link from "next/link";
import { deleteAttendanceAction } from "@/app/actions/attendance-admin";
import { AttendanceAddForm } from "@/components/admin/attendance-add-form";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button, Card, inputClass } from "@/components/ui";
import { attendanceAffiliations } from "@/db/schema";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  academicYearStart,
  addDays,
  ATTENDANCE_RETENTION_YEARS,
  attendanceDay,
  attendanceUrl,
  dayDate,
  isClubDay,
  listNight,
  listNights,
  nextClubDay,
  parseDay,
  summarize,
} from "@/lib/attendance";
import { formatDate, formatShortDate, formatTime } from "@/lib/time";

type Params = { den?: string; od?: string; do?: string };

const buttonClass = "rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-accent";
const linkClass = "text-sm font-medium text-accent hover:underline";

/** The last club night up to `day` (`day` itself when it is one). */
function lastClubDay(day: string) {
  for (let i = 0; i < 7; i++) {
    const d = addDays(day, -i);
    if (isClubDay(d)) return d;
  }
  return day;
}

/** The club night before `day`. */
function previousClubDay(day: string) {
  return lastClubDay(addDays(day, -1));
}

/** The same page with these parameters; empty ones are left out of the address. */
function href(params: Params) {
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
  return q.size ? `/admin/prezence?${q}` : "/admin/prezence";
}

/**
 * Admin → Prezenčka: the QR code for the table, who came on one night (tonight's, or the last one, by default) with
 * adding and deleting by hand, and the numbers of a period with its CSV for reports.
 */
export default async function AttendanceAdminPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const today = attendanceDay();
  const night = parseDay(params.den) ?? lastClubDay(today);
  let from = parseDay(params.od) ?? academicYearStart(today);
  let to = parseDay(params.do) ?? today;
  if (from > to) [from, to] = [to, from];
  const [{ locale, t }, entries, nights, sum] = await Promise.all([getDict(), listNight(night), listNights(from, to), summarize(from, to)]);
  const a = t.admin.attendance;
  const url = attendanceUrl();
  const prev = previousClubDay(night);
  const next = nextClubDay(night);
  const range = { od: params.od, do: params.do };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{a.title}</h1>
        <p className="max-w-3xl text-sm text-muted">{a.intro(ATTENDANCE_RETENTION_YEARS)}</p>
      </div>

      <Card className="flex flex-wrap items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- plain SVG from our own route, no optimisation needed */}
        <img src="/prezence/qr.svg" alt={url} width={128} height={128} className="h-32 w-32 rounded-md bg-white" />
        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <p className="text-sm font-medium">{a.link}</p>
            <a href={url} target="_blank" rel="noreferrer" className="break-all font-mono text-sm text-accent hover:underline" data-testid="attendance-link">
              {url.replace(/^https?:\/\//, "")}
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/prezence/tisk" className={buttonClass}>{a.printCard}</Link>
            <a href="/prezence/qr.svg" download="prezence-qr.svg" className={buttonClass}>{a.downloadSvg}</a>
            <a href="/prezence/qr.png" download="prezence-qr.png" className={buttonClass}>{a.downloadPng}</a>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-4" id="vecer">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold" data-testid="attendance-night">
            {formatDate(dayDate(night), locale)}
            <span className="ml-2 text-base font-normal text-muted">
              {night === today && `${a.tonight} · `}
              {!isClubDay(night) && `${a.notClubNight} · `}
              {a.people(entries.length)}
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href={`${href({ ...range, den: prev })}#vecer`} className={buttonClass}>
              ← {formatShortDate(dayDate(prev), locale)}
            </Link>
            {next && next <= today && (
              <Link href={`${href({ ...range, den: next })}#vecer`} className={buttonClass}>
                {formatShortDate(dayDate(next), locale)} →
              </Link>
            )}
            <form action="/admin/prezence#vecer" className="flex items-center gap-2">
              {params.od && <input type="hidden" name="od" value={params.od} />}
              {params.do && <input type="hidden" name="do" value={params.do} />}
              <input name="den" type="date" defaultValue={night} aria-label={a.add.day} className={inputClass} />
              <Button type="submit" variant="secondary">{a.show}</Button>
            </form>
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="text-muted">{a.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="attendance-entries">
              <thead className="text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">{a.time}</th>
                  <th className="py-2 pr-3 font-medium">{a.firstName}</th>
                  <th className="py-2 pr-3 font-medium">{a.lastName}</th>
                  <th className="py-2 pr-3 font-medium">{a.affiliation}</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const name = e.firstName ? `${e.firstName} ${e.lastName}` : a.erased;
                  return (
                    <tr key={e.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 text-muted">{i + 1}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatTime(e.createdAt, locale)}</td>
                      {e.firstName ? (
                        <>
                          <td className="py-2 pr-3">{e.firstName}</td>
                          <td className="py-2 pr-3">{e.lastName}</td>
                        </>
                      ) : (
                        <td colSpan={2} className="py-2 pr-3 text-muted">{a.erased}</td>
                      )}
                      <td className="py-2 pr-3">
                        {t.attendance.form.answers[e.affiliation]}
                        {e.addedBy !== null && <span className="ml-2 text-xs text-muted">{a.byHand(e.addedByNickname)}</span>}
                      </td>
                      <td className="py-2 text-right">
                        <form action={deleteAttendanceAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <SubmitButton variant="danger" confirmText={a.deleteConfirm(name)} aria-label={`${a.delete}: ${name}`}>
                            ✕
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <details className="border-t border-border pt-3" open={entries.length === 0 && night === today}>
          <summary className="cursor-pointer font-semibold">{a.add.title}</summary>
          <div className="mt-3">
            <AttendanceAddForm t={a.add} fields={t.attendance.form} day={night} />
          </div>
        </details>
      </Card>

      <Card className="flex flex-col gap-4" id="prehled">
        <h2 className="text-xl font-bold">{a.overview}</h2>
        <form action="/admin/prezence#prehled" className="flex flex-wrap items-end gap-3 text-sm">
          {params.den && <input type="hidden" name="den" value={params.den} />}
          <label className="flex flex-col gap-1">
            <span className="font-medium">{a.from}</span>
            <input name="od" type="date" defaultValue={from} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">{a.to}</span>
            <input name="do" type="date" defaultValue={to} className={inputClass} />
          </label>
          <Button type="submit" variant="secondary">{a.show}</Button>
          <a href={`/admin/prezence/export.csv?od=${from}&do=${to}`} className={buttonClass} data-testid="attendance-csv">
            {a.downloadCsv}
          </a>
        </form>

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

        <h3 className="font-semibold">{a.nights}</h3>
        {nights.length === 0 ? (
          <p className="text-sm text-muted">{a.noNights}</p>
        ) : (
          <div className="overflow-x-auto">
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
                      <Link href={`${href({ ...range, den: n.day })}#vecer`} className={linkClass}>
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
        )}
      </Card>
    </div>
  );
}
