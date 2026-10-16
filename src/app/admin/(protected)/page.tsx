import Link from "next/link";
import { cookies } from "next/headers";
import { SetupWarnings } from "@/components/admin/setup-warnings";
import { ColumnChart, nightColumns, StatTile } from "@/components/admin/stat-charts";
import { Card } from "@/components/ui";
import { changelog, changelogStamp } from "@/data/changelog";
import { getDict } from "@/i18n/server";
import { canAccess, hasRole, requireAdmin } from "@/lib/admin-auth";
import { academicYearStart, attendanceDay, countNight, listNights, openNight, summarize } from "@/lib/attendance";
import { attendanceStats, loanStats } from "@/lib/club-stats";
import { NEWS_COOKIE } from "@/lib/news";
import { formatShortDate, formatTime } from "@/lib/time";
import { GrimoireLink } from "@/modules/botc/components/grimoire/grimoire-link";
import { countDraftAttention } from "@/modules/botc/lib/draft/queries";
import { listGrimoires } from "@/modules/botc/lib/grimoire/service";
import { listAllSessions } from "@/modules/botc/lib/queries";

const NEXT_SESSIONS = 3;
const link = "select-none text-sm font-medium text-accent hover:underline";

/** The club's numbers from `from` to `to`, as admin → Klub → Statistiky counts them, and what is lent now */
async function clubNumbers(from: string, to: string) {
  const [sum, nights, att, loans] = await Promise.all([summarize(from, to), listNights(from, to), attendanceStats(from, to), loanStats(from, to)]);
  return { sum, nights, newcomers: att.newcomers, loans };
}

/**
 * The admin's home: the club at a glance, each module a section. The club (the main section): tonight's sheet, the
 * games lent and this academic year's numbers; Krvavka: the next sessions, drafts waiting for this account, its
 * grimoires in play (the main section for one who does not see the club, the club then only links its pages);
 * Krycí jména: the key cards; the admin itself: the latest news, accounts and history.
 * Only the parts the account sees.
 */
export default async function AdminOverviewPage() {
  const me = await requireAdmin();
  const botc = canAccess(me, "botc");
  const club = canAccess(me, "club");
  const night = club ? openNight() : null;
  // since 1 September, as Statistiky klubu opens
  const today = attendanceDay();
  const [{ locale, t }, sessions, attention, grimoires, jar, tonight, year] = await Promise.all([
    getDict(),
    botc ? listAllSessions() : [],
    botc ? countDraftAttention(me.id) : { turns: 0, invites: 0 },
    botc ? listGrimoires(me) : [],
    cookies(),
    night ? countNight(night) : null,
    club ? clubNumbers(academicYearStart(today), today) : null,
  ]);
  const o = t.admin.overview;
  const n = t.admin.nav;
  const cs = t.admin.clubStats;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const now = new Date();
  const next = sessions.filter((s) => s.endsAt >= now).slice(0, NEXT_SESSIONS);
  const playing = grimoires.filter((g) => g.ownerId === me.id && !g.endedAt).slice(0, 3);
  const [latest] = changelog;
  const newsUnread = jar.get(NEWS_COOKIE)?.value !== changelogStamp();

  const krvavka = botc && (
    <Card className="flex flex-col gap-5" id="krvavka">
      <h2 className="text-xl font-bold">🕰 {n.botc}</h2>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{o.nextSessions}</h3>
          {canAccess(me, "botc", "edit") && (
            <Link href="/admin/botc/novy" className="select-none rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90">
              {t.admin.list.createNew}
            </Link>
          )}
        </div>
        {next.length === 0 && <p className="text-sm text-muted">{o.noSessions}</p>}
        <ul className="flex flex-col gap-1.5" data-testid="overview-sessions">
          {next.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/botc/termin/${s.id}`} className="select-none flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg border border-border px-3 py-2 hover:border-accent/50">
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
        <Link href="/admin/botc/drafty" className="select-none rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm font-medium" data-testid="overview-drafts">
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
  );

  const clubPages = (
    <>
      {(club || botc) && <Link href="/admin/web" className={link}>{n.web}</Link>}
      <Link href="/" className={link}>{o.clubPage}</Link>
      <Link href="/hry" className={link}>{o.games}</Link>
    </>
  );

  const clubCard = year ? (
    <Card className="flex flex-col gap-5" id="klub">
      <h2 className="text-xl font-bold">🎲 {n.club}</h2>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Link href="/admin/prezence" className={link} data-testid="overview-attendance">
          {n.attendance}
          {tonight !== null && <span className="ml-2 font-normal text-muted">{o.attendanceTonight(tonight)}</span>}
        </Link>
        <Link href="/admin/pujcovna" className={link} data-testid="overview-loans">
          {n.loans}
          {year.loans.openNow > 0 && <span className="ml-2 font-normal text-muted">{o.loansOut(year.loans.openNow)}</span>}
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{cs.presets.year}</h3>
          <Link href="/admin/statistiky-klubu" className={link}>{o.allStats}</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="overview-club-stats">
          <StatTile label={cs.nights} value={year.sum.nights} />
          <StatTile label={cs.people} value={year.sum.people} />
          <StatTile label={cs.average} value={year.sum.nights ? number.format(year.sum.visits / year.sum.nights) : "–"} />
          <StatTile label={cs.newcomers} value={year.newcomers} />
          <StatTile label={cs.loansCount} value={year.loans.loans} />
          <StatTile label={cs.loanGames} value={year.loans.games} />
        </div>
        {year.nights.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">{cs.perNight}</span>
            <ColumnChart data={nightColumns(year.nights, locale)} unit={cs.peopleN} label={cs.perNight} values testId="overview-nights-chart" />
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3">{clubPages}</div>
    </Card>
  ) : (
    // one who does not see the club: its pages only
    <Card className="flex flex-col gap-3" id="klub">
      <h2 className="text-xl font-bold">🎲 {n.club}</h2>
      <div className="flex flex-col gap-1">{clubPages}</div>
    </Card>
  );

  // the club leads; for one who does not see it, Krvavka does
  const main = club ? clubCard : krvavka;
  const side = club ? krvavka : clubCard;

  return (
    <div className="flex flex-col gap-6">
      <SetupWarnings t={t} locale={locale} />
      <h1 className="text-2xl font-bold">{o.hello(me.nickname)}</h1>
      <div className={main ? "grid gap-6 lg:grid-cols-[2fr_1fr]" : "grid gap-6 lg:max-w-xl"}>
        {main}

        {/* the other module, Krycí jména and the admin itself share the side column */}
        <div className="flex flex-col gap-6">
          {side}

          <Card className="flex flex-col gap-3" id="kryci-jmena">
            <h2 className="text-xl font-bold">🕵️ {n.codenames}</h2>
            <div className="flex flex-col gap-1">
              <Link href="/admin/kryci-jmena" className={link} data-testid="overview-codenames">
                {n.keyCards}
                <span className="ml-2 font-normal text-muted">{t.admin.codenames.overview}</span>
              </Link>
              <Link href="/admin/kryci-jmena/tisk" className={link}>
                {n.keyCardsPrint}
                <span className="ml-2 font-normal text-muted">{t.admin.codenames.print.overview}</span>
              </Link>
            </div>
          </Card>

          <Card className="flex flex-col gap-5" id="administrace">
            <h2 className="text-xl font-bold">⚙️ {n.administration}</h2>
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
              {hasRole(me, "admin") && <Link href="/admin/ucty" className={link}>{n.accounts}</Link>}
              {hasRole(me, "admin") && <Link href="/admin/historie" className={link}>{n.log}</Link>}
              <Link href="/admin/profil" className={link}>{n.profile}</Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
