import Link from "next/link";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { listAllSessions } from "@/lib/queries";
import { effectiveRegistrationState, scheduledOpening } from "@/lib/registration-state";
import { formatDate, formatShortDate, formatTime } from "@/lib/time";
import { orgFeedUrl } from "@/lib/org-feed";

export default async function AdminHomePage() {
  const [{ locale, t }, sessions] = await Promise.all([getDict(), listAllSessions()]);
  const a = t.admin.list;
  const now = new Date();
  const upcoming = sessions.filter((s) => s.endsAt >= now);
  const past = sessions.filter((s) => s.endsAt < now).reverse();

  /** Only for closed sign-ups: "not open", "paused" or when they open on their own */
  const StateBadge = ({ s }: { s: (typeof sessions)[number] }) => {
    if (effectiveRegistrationState(s) === "open") return null;
    const opens = scheduledOpening(s);
    return (
      <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted">
        {opens
          ? a.opensShort(formatShortDate(opens, locale), formatTime(opens, locale))
          : s.registrationState === "paused"
            ? a.pausedShort
            : a.notOpenShort}
      </span>
    );
  };

  const Row = ({ s }: { s: (typeof sessions)[number] }) => (
    <Link href={`/admin/termin/${s.id}`} className="block">
      <Card className="flex flex-col gap-1 hover:border-accent/50 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            {s.title}
            <StateBadge s={s} />
          </p>
          <p className="text-sm text-muted">
            <span>{formatDate(s.startsAt, locale)}</span>, {formatTime(s.startsAt, locale)}–{formatTime(s.endsAt, locale)} · {s.place}
          </p>
        </div>
        <p className="text-sm font-medium">
          {s.confirmedCount} / {s.capacity}
          {s.waitlistedCount > 0 && <span className="ml-2 text-xs text-muted">{a.waitlistShort(s.waitlistedCount)}</span>}
        </p>
      </Card>
    </Link>
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">{a.upcoming}</h1>
        {upcoming.length === 0 && (
          <p className="text-muted">{a.none}<Link href="/admin/novy" className="underline">{a.createNew}</Link>.</p>
        )}
        {upcoming.map((s) => <Row key={s.id} s={s} />)}
      </section>
      {past.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold text-muted">{a.past}</h2>
          {past.map((s) => <Row key={s.id} s={s} />)}
        </section>
      )}
      {orgFeedUrl() && (
        <p className="text-sm text-muted">
          <a href={orgFeedUrl()!} className="underline hover:text-accent">{a.orgCalendar}</a>
          <span className="block text-xs">{a.orgCalendarHint}</span>
          <code className="block select-all break-all text-xs">{orgFeedUrl()}</code>
        </p>
      )}
    </div>
  );
}
