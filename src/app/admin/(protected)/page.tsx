import Link from "next/link";
import { cookies } from "next/headers";
import { SetupWarnings } from "@/components/admin/setup-warnings";
import { Card } from "@/components/ui";
import { changelog, changelogStamp } from "@/data/changelog";
import { getDict } from "@/i18n/server";
import { hasRole, requireAdmin } from "@/lib/admin-auth";
import { countNight, openNight } from "@/lib/attendance";
import { NEWS_COOKIE } from "@/lib/news";
import { formatShortDate, formatTime } from "@/lib/time";
import { GrimoireLink } from "@/modules/botc/components/grimoire/grimoire-link";
import { countDraftAttention } from "@/modules/botc/lib/draft/queries";
import { listGrimoires } from "@/modules/botc/lib/grimoire/service";
import { listAllSessions } from "@/modules/botc/lib/queries";

const NEXT_SESSIONS = 3;
const link = "text-sm font-medium text-accent hover:underline";

/**
 * The admin's home: the club at a glance, each module a section. Krvavka: the next sessions, drafts waiting for
 * this account, its grimoires in play; the club: the latest news and the club's pages.
 */
export default async function AdminOverviewPage() {
  const me = await requireAdmin();
  const night = openNight();
  const [{ locale, t }, sessions, attention, grimoires, jar, tonight] = await Promise.all([
    getDict(),
    listAllSessions(),
    countDraftAttention(me.id),
    listGrimoires(me),
    cookies(),
    night ? countNight(night) : null,
  ]);
  const o = t.admin.overview;
  const n = t.admin.nav;
  const now = new Date();
  const next = sessions.filter((s) => s.endsAt >= now).slice(0, NEXT_SESSIONS);
  const playing = grimoires.filter((g) => g.ownerId === me.id && !g.endedAt).slice(0, 3);
  const [latest] = changelog;
  const newsUnread = jar.get(NEWS_COOKIE)?.value !== changelogStamp();

  return (
    <div className="flex flex-col gap-6">
      <SetupWarnings t={t} locale={locale} />
      <h1 className="text-2xl font-bold">{o.hello(me.nickname)}</h1>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="flex flex-col gap-5" id="krvavka">
          <h2 className="text-xl font-bold">🕰 {n.botc}</h2>

          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{o.nextSessions}</h3>
              <Link href="/admin/botc/novy" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90">
                {t.admin.list.createNew}
              </Link>
            </div>
            {next.length === 0 && <p className="text-sm text-muted">{o.noSessions}</p>}
            <ul className="flex flex-col gap-1.5" data-testid="overview-sessions">
              {next.map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/botc/termin/${s.id}`} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg border border-border px-3 py-2 hover:border-accent/50">
                    <span className="font-medium">{s.title}</span>
                    <span className="text-sm text-muted">
                      {formatShortDate(s.startsAt, locale)} {formatTime(s.startsAt, locale)} · {s.confirmedCount} / {s.capacity}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/admin/botc" className={link}>
              {o.allSessions}
            </Link>
          </section>

          {(attention.turns > 0 || attention.invites > 0) && (
            <Link href="/admin/botc/drafty" className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm font-medium" data-testid="overview-drafts">
              {[attention.turns > 0 && o.draftTurns(attention.turns), attention.invites > 0 && o.draftInvites(attention.invites)].filter(Boolean).join(" · ")} →
            </Link>
          )}

          {playing.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">{o.grimoires}</h3>
              {playing.map((g) => (
                <GrimoireLink key={g.id} item={g} t={t} locale={locale} />
              ))}
            </section>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3">
            <Link href="/admin/botc" className={link}>{n.sessions}</Link>
            <Link href="/admin/botc/statistiky" className={link}>{n.stats}</Link>
            <Link href="/admin/botc/drafty" className={link}>{n.drafts}</Link>
            <Link href="/admin/botc/scripty" className={link}>{n.scripts}</Link>
            <Link href="/admin/botc/grimoary" className={link}>{n.grimoires}</Link>
          </div>
        </Card>

        <Card className="flex flex-col gap-5" id="klub">
          <h2 className="text-xl font-bold">🎲 {n.club}</h2>
          {latest && (
            <section className="flex flex-col gap-1">
              <h3 className="flex items-center gap-2 font-semibold">
                {n.news}
                {newsUnread && <span className="inline-block size-2 rounded-full bg-accent" title={n.newsUnread} aria-label={n.newsUnread} />}
              </h3>
              <p className="text-sm">
                <span className="text-muted">{formatShortDate(new Date(`${latest.date}T12:00:00Z`), locale)} –</span> {latest.title}
              </p>
              <Link href="/admin/novinky" className={link}>
                {t.admin.news.open}
              </Link>
            </section>
          )}
          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <Link href="/admin/prezence" className={link} data-testid="overview-attendance">
              {n.attendance}
              {tonight !== null && <span className="ml-2 font-normal text-muted">{o.attendanceTonight(tonight)}</span>}
            </Link>
            <Link href="/admin/web" className={link}>{n.web}</Link>
            {hasRole(me, "admin") && <Link href="/admin/ucty" className={link}>{n.accounts}</Link>}
            <Link href="/admin/profil" className={link}>{n.profile}</Link>
            <Link href="/" className={link}>{o.clubPage}</Link>
            <Link href="/hry" className={link}>{o.games}</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
