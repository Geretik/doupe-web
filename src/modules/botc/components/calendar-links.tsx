import type { Session } from "@/db/schema";
import type { Dict } from "@/i18n/dictionaries";
import { googleCalendarUrl } from "@/modules/botc/lib/ics";

/** "Add to calendar" links for one session (.ics download + Google Calendar). */
export function CalendarLinks({ session, t, className = "" }: { session: Session; t: Dict; className?: string }) {
  return (
    <p className={`text-sm ${className}`}>
      <span aria-hidden className="mr-1.5">🗓️</span>
      <span className="text-muted">{t.session.addToCalendar} </span>
      <a href={`/botc/termin/${session.id}/kalendar.ics`} className="underline hover:text-accent">
        {t.session.calendarIcs}
      </a>
      <span className="text-muted"> · </span>
      <a href={googleCalendarUrl(session)} target="_blank" rel="noreferrer" className="underline hover:text-accent">
        {t.session.calendarGoogle}
      </a>
    </p>
  );
}
