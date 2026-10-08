import Link from "next/link";
import type { Dict, Locale } from "@/i18n/dictionaries";
import type { SessionWithCount } from "@/modules/botc/lib/queries";
import { effectiveRegistrationState, scheduledOpening } from "@/modules/botc/lib/registration-state";
import { formatDate, formatShortDate, formatTime } from "@/lib/time";
import { EditPencil } from "@/components/edit-pencil";
import { ScriptLinks } from "./script-links";
import { Card } from "@/components/ui";

/** Spots a newcomer can take: none while anybody is on the waitlist – the waitlist has priority. */
export function freeSpots(s: SessionWithCount) {
  return s.waitlistedCount > 0 ? 0 : Math.max(0, s.capacity - s.confirmedCount);
}

export function SessionCard({
  session: s,
  admin = false,
  locale,
  t,
}: {
  session: SessionWithCount;
  admin?: boolean;
  locale: Locale;
  t: Dict;
}) {
  const free = freeSpots(s);
  const full = free === 0;
  const regState = effectiveRegistrationState(s);
  const opensAt = scheduledOpening(s);
  const closed = regState !== "open";
  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {s.title}
          {admin && <EditPencil href={`/admin/botc/termin/${s.id}`} title={t.session.editPencil} />}
        </h2>
        <p className="text-sm">
          <span aria-hidden className="mr-1.5">📅</span>
          {formatDate(s.startsAt, locale)}, {formatTime(s.startsAt, locale)}–{formatTime(s.endsAt, locale)}
        </p>
        <p className="text-sm text-muted">
          <span aria-hidden className="mr-1.5">📍</span>
          {s.place}
        </p>
        <p className="text-sm">
          <span aria-hidden className="mr-1.5">🗣️</span>
          <span className="text-muted">{t.session.languageLabel}: </span>
          {t.session.languages[s.gameLanguage]}
        </p>
        {s.storyteller && (
          <p className="text-sm">
            <span aria-hidden className="mr-1.5">🎩</span>
            <span className="text-muted">{t.session.storytellerLabel}: </span>
            {s.storyteller}
          </p>
        )}
        {s.note && (
          <p className="text-sm text-muted whitespace-pre-line">
            <span aria-hidden className="mr-1.5">📝</span>
            {s.note}
          </p>
        )}
        <ScriptLinks scripts={s.scripts} label={t.session.scripts(s.scripts.length)} />
      </div>
      {/* phones: spots and the button side by side below the details; wider screens: on the right, the spots above
          the button, each line kept whole however long the details are */}
      <div className="flex items-center justify-between gap-4 border-t border-border pt-3 sm:shrink-0 sm:flex-col sm:items-end sm:gap-2 sm:border-0 sm:pt-0">
        <div className="flex flex-col gap-0.5 sm:items-end sm:whitespace-nowrap sm:text-right">
          <span
            className={`text-sm font-medium ${full ? "text-accent" : "text-green-700 dark:text-green-400"}`}
          >
            {full ? t.session.full : t.session.freeSpots(free, s.capacity)}
          </span>
          {s.waitlistedCount > 0 && (
            <span className="text-xs text-muted">{t.session.waitlisted(s.waitlistedCount)}</span>
          )}
          {closed && (
            <span className="text-xs font-medium text-muted">
              {opensAt
                ? t.session.cardOpensAt(formatShortDate(opensAt, locale), formatTime(opensAt, locale))
                : regState === "paused"
                  ? t.session.cardPaused
                  : t.session.cardNotOpen}
            </span>
          )}
        </div>
        <Link
          href={`/botc/termin/${s.id}`}
          className={`shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium ${
            full || closed
              ? "border border-border text-muted"
              : "bg-accent text-accent-foreground hover:opacity-90"
          }`}
        >
          {full || closed ? t.session.detail : t.session.register}
        </Link>
      </div>
    </Card>
  );
}
