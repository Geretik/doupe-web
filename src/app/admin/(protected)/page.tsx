import Link from "next/link";
import { rotateFeedKeyAction } from "@/modules/botc/actions/sessions";
import { ActionButton } from "@/components/admin/action-button";
import { SetupWarnings } from "@/components/admin/setup-warnings";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listAllSessions } from "@/modules/botc/lib/queries";
import { effectiveRegistrationState, scheduledOpening } from "@/modules/botc/lib/registration-state";
import { formatDate, formatShortDate, formatTime } from "@/lib/time";
import { orgFeedUrl } from "@/modules/botc/lib/org-feed";

export default async function AdminHomePage() {
  const me = await requireAdmin();
  const [{ locale, t }, sessions, feedUrl] = await Promise.all([getDict(), listAllSessions(), orgFeedUrl(me)]);
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
      <SetupWarnings t={t} locale={locale} />
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{a.upcoming}</h1>
          <Link href="/admin/novy" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90">
            {a.createNew}
          </Link>
        </div>
        {upcoming.length === 0 && <p className="text-muted">{a.none}</p>}
        {upcoming.map((s) => <Row key={s.id} s={s} />)}
      </section>
      {past.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold text-muted">{a.past}</h2>
          {past.map((s) => <Row key={s.id} s={s} />)}
        </section>
      )}
      {feedUrl && (
        <div className="flex flex-col gap-1 text-sm text-muted">
          <a href={feedUrl} className="underline hover:text-accent">{a.orgCalendar}</a>
          <span className="text-xs">{a.orgCalendarHint}</span>
          <code className="select-all break-all text-xs">{feedUrl}</code>
          <span>
            <ActionButton action={rotateFeedKeyAction} label={a.orgCalendarRotate} confirmText={a.orgCalendarRotateConfirm} />
          </span>
        </div>
      )}
    </div>
  );
}
