import type { Metadata } from "next";
import { forgetAttendanceAction } from "@/app/actions/attendance";
import { AttendanceSheet } from "@/components/attendance-sheet";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { attendanceDay, dayDate, nextClubDay, openNight, phoneEntry, rememberedPerson } from "@/lib/attendance";
import { formatDate, formatTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: `${t.attendance.title} – ${t.meta.title}`, description: t.attendance.description, robots: { index: false } };
}

/**
 * The club's attendance sheet, where the QR code on the table leads (lib/attendance): the same address every time, on a
 * club night it is that night's sheet, on other days it says when the next one is.
 */
export default async function AttendancePage() {
  const { locale, t } = await getDict();
  const a = t.attendance;
  const night = openNight();
  const me = await rememberedPerson();
  const entry = night && me ? await phoneEntry(night, me.key) : undefined;

  if (!night) {
    const next = nextClubDay(attendanceDay());
    // "Úterý 13. října 2026" inside a Czech sentence starts with a small letter
    const nextLabel = next && formatDate(dayDate(next), locale).replace(/^./, (c) => (locale === "cs" ? c.toLowerCase() : c));
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{a.title}</h1>
        <Card className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{a.closedTitle}</h2>
          <p className="text-muted">{a.closed(nextLabel)}</p>
        </Card>
        {me && (
          <form action={forgetAttendanceAction} className="flex flex-wrap items-baseline gap-x-3 text-sm text-muted">
            {a.rememberedHere(`${me.firstName} ${me.lastName}`)}
            <button type="submit" className="font-medium text-accent hover:underline">
              {a.forget}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{a.title}</h1>
        <p className="mt-1 text-muted">{a.night(formatDate(dayDate(night), locale))}</p>
      </div>
      <AttendanceSheet
        t={a.form}
        affiliations={a.affiliations}
        remembered={me && { firstName: me.firstName, lastName: me.lastName, affiliation: me.affiliation }}
        recordedAt={entry ? formatTime(entry.createdAt, locale) : null}
      />
    </div>
  );
}
