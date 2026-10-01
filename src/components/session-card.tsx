import Link from "next/link";
import type { Dict, Locale } from "@/i18n/dictionaries";
import type { SessionWithCount } from "@/lib/queries";
import { effectiveRegistrationState, scheduledOpening } from "@/lib/registration-state";
import { formatDate, formatShortDate, formatTime } from "@/lib/time";
import { EditPencil } from "./edit-pencil";
import { ScriptLinks } from "./script-links";
import { Card } from "./ui";

export function freeSpots(s: SessionWithCount) {
  return Math.max(0, s.capacity - s.confirmedCount);
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
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {s.title}
          {admin && <EditPencil sessionId={s.id} title={t.session.editPencil} />}
        </h2>
        <p className="text-sm">
          <span aria-hidden className="mr-1.5">📅</span>
          {formatDate(s.startsAt, locale)}, {formatTime(s.startsAt, locale)}–{formatTime(s.endsAt, locale)}
        </p>
        <p className="text-sm text-muted">
          <span aria-hidden className="mr-1.5">📍</span>
          {s.place}
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
      <div className="flex flex-col items-start gap-2 sm:items-end">
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
        <Link
          href={`/botc/termin/${s.id}`}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
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
