import Link from "next/link";
import { deleteAttendanceAction } from "@/app/actions/attendance-admin";
import { AttendanceAddForm } from "@/components/admin/attendance-add-form";
import { SubmitButton } from "@/components/admin/submit-button";
import { Alert, Button, Card, inputClass } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { canAccess, requireAccess } from "@/lib/admin-auth";
import { addDays, ATTENDANCE_RETENTION_YEARS, attendanceDay, attendanceUrl, dayDate, isClubDay, listNight, nextClubDay, parseDay } from "@/lib/attendance";
import { formatDate, formatShortDate, formatTime } from "@/lib/time";

type Params = { den?: string };

const buttonClass = "select-none rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-accent";

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

/**
 * Admin → Prezenčka: the QR code for the table, who came on one night (tonight's, or the last one, by default) with
 * adding and deleting by hand. The numbers of a period, with the CSV for reports, are in Statistiky klubu.
 */
export default async function AttendanceAdminPage({ searchParams }: { searchParams: Promise<Params> }) {
  const me = await requireAccess("club");
  // one who only reads the club sees the sheet without adding or deleting
  const edit = canAccess(me, "club", "edit");
  const params = await searchParams;
  const today = attendanceDay();
  const night = parseDay(params.den) ?? lastClubDay(today);
  const [{ locale, t }, entries] = await Promise.all([getDict(), listNight(night)]);
  const a = t.admin.attendance;
  const url = attendanceUrl();
  const prev = previousClubDay(night);
  const next = nextClubDay(night);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{a.title}</h1>
        <p className="max-w-3xl text-sm text-muted">{a.intro(ATTENDANCE_RETENTION_YEARS)}</p>
        <p className="text-sm">
          <Link href="/admin/statistiky-klubu" className="font-medium text-accent hover:underline" data-testid="attendance-stats-link">
            {a.toStats}
          </Link>
          <span className="text-muted"> – {a.toStatsHint}</span>
        </p>
        {!edit && <Alert kind="info">{t.admin.readOnly}</Alert>}
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
            <Link href={`/admin/prezence?den=${prev}#vecer`} className={buttonClass}>
              ← {formatShortDate(dayDate(prev), locale)}
            </Link>
            {next && next <= today && (
              <Link href={`/admin/prezence?den=${next}#vecer`} className={buttonClass}>
                {formatShortDate(dayDate(next), locale)} →
              </Link>
            )}
            <form action="/admin/prezence#vecer" className="flex items-center gap-2">
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
                        {edit && (
                          <form action={deleteAttendanceAction}>
                            <input type="hidden" name="id" value={e.id} />
                            <SubmitButton variant="danger" confirmText={a.deleteConfirm(name)} aria-label={`${a.delete}: ${name}`}>
                              ✕
                            </SubmitButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {edit && (
          <details className="border-t border-border pt-3" open={entries.length === 0 && night === today}>
            <summary className="cursor-pointer font-semibold">{a.add.title}</summary>
            <div className="mt-3">
              <AttendanceAddForm t={a.add} fields={t.attendance.form} day={night} />
            </div>
          </details>
        )}
      </Card>
    </div>
  );
}
