import Link from "next/link";
import { GameCard } from "@/modules/botc/components/game-card";
import { Alert, Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { findRole, roleIcon, roleName, roleSide, STORYTELLER } from "@/modules/botc/lib/botc-roles";
import { verifyMyGamesToken } from "@/modules/botc/lib/my-games-token";
import { playerStats } from "@/modules/botc/lib/player-stats";
import { gamesBySession, listRegistrationsByEmail } from "@/modules/botc/lib/queries";
import { editUrl } from "@/lib/site";
import { formatDate, formatDay, formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

const box = "rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm";
const chip = "inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pr-2.5 pl-1 text-xs";

/**
 * The player's overview behind the magic link: upcoming sign-ups with edit links, their stats, and the
 * nights they came to with the games played there, as in the archive.
 */
export default async function MyGamesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { locale, t } = await getDict();
  const m = t.myGames;
  const email = verifyMyGamesToken(token);
  if (!email) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{m.title}</h1>
        <Alert kind="error">{m.linkInvalid}</Alert>
        <Link href="/botc/moje-hry" className="text-sm underline">{m.submit}</Link>
      </div>
    );
  }
  const regs = await listRegistrationsByEmail(email);
  const now = new Date();
  const upcoming = regs
    .filter((r) => r.session.endsAt >= now && r.status !== "cancelled")
    .sort((a, b) => a.session.startsAt.getTime() - b.session.startsAt.getTime());
  // cancelled sign-ups too: organisers may have entered the player in a game anyway
  const pastRegs = regs.filter((r) => r.session.endsAt < now);
  const gamesOf = await gamesBySession(pastRegs.map((r) => r.sessionId));
  const me = new Set(pastRegs.map((r) => r.id));
  // the nights the player came to: signed up and not marked as a no-show, or entered in a game
  const nights = pastRegs
    .filter(
      (r) =>
        (r.status === "confirmed" && r.attended !== false) ||
        gamesOf.get(r.sessionId)?.some((g) => g.roster.some((p) => p.registrationId === r.id)),
    )
    .sort((a, b) => b.session.startsAt.getTime() - a.session.startsAt.getTime());
  const nightGames = nights.flatMap((r) => gamesOf.get(r.sessionId) ?? []);
  const stats = playerStats(me, nightGames);
  const decided = stats.decided.good + stats.decided.evil;
  const won = stats.won.good + stats.won.evil;
  const tiles: [string, string | number, string?][] = [
    [m.nights, nights.length],
    [m.played, stats.played],
    [m.wins, decided ? `${won} / ${decided}` : "–", decided ? `${Math.round((won / decided) * 100)} %` : undefined],
    ...(stats.storytold > 0 ? [[m.storytold, stats.storytold] as [string, number]] : []),
  ];
  const anyIcon = nightGames.some((g) => g.demonBluffs?.length || g.roster.some((p) => findRole(p.role)));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{m.title}</h1>
        <p className="mt-1 text-sm text-muted">{email}</p>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{m.upcoming}</h2>
        {upcoming.length === 0 && (
          <p className="text-muted">{m.none}<Link href="/botc" className="underline">{m.browse}</Link>.</p>
        )}
        {upcoming.map((r) => (
          <Card key={r.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                <Link href={`/botc/termin/${r.session.id}`} className="hover:underline">{r.session.title}</Link>
              </p>
              <p className="text-sm text-muted">
                📅 {formatRange(r.session.startsAt, r.session.endsAt, locale)} · 📍 {r.session.place}
              </p>
              <p className="text-sm">{r.status === "waitlisted" ? "⏳" : "✅"} {m.status[r.status]}</p>
            </div>
            <a href={editUrl(r.editToken)} className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-accent">
              {m.edit}
            </a>
          </Card>
        ))}
      </section>
      {nights.length > 0 && (
        <section className="flex flex-col gap-3" data-testid="my-stats">
          <div>
            <h2 className="text-lg font-semibold">{m.statsTitle}</h2>
            <p className="text-sm text-muted">{m.since(formatDay(nights[nights.length - 1].session.startsAt, locale))}</p>
          </div>
          <div className={`grid gap-3 ${tiles.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
            {tiles.map(([label, value, hint]) => (
              <Card key={label} className="flex flex-col gap-1">
                <span className="text-xs text-muted">{label}</span>
                <span className="text-2xl font-bold">{value}</span>
                {hint && <span className="text-xs text-muted">{hint}</span>}
              </Card>
            ))}
          </div>
          {stats.played > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {(["good", "evil"] as const)
                .filter((side) => stats.sides[side] > 0)
                .map((side) => (
                  <li key={side}>
                    <span className={`font-semibold ${side === "good" ? "text-good" : "text-accent"}`}>
                      {side === "good" ? "😇" : "😈"} {m.sides[side]}:
                    </span>{" "}
                    {m.gamesCount(stats.sides[side])}
                    {stats.decided[side] > 0 && <span className="text-muted"> · {m.winsCount(stats.won[side])}</span>}
                  </li>
                ))}
              {stats.sides.travellers > 0 && (
                <li>
                  <span className="font-semibold text-muted">🧳 {m.sides.travellers}:</span> {m.gamesCount(stats.sides.travellers)}
                </li>
              )}
            </ul>
          )}
          {stats.roles.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold">{m.roles}</h3>
              <ul className="flex flex-wrap gap-1.5">
                {stats.roles.slice(0, 8).map(({ role, count }) => (
                  <li key={role.id} className={chip}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized WebP from public/, no optimisation needed */}
                    <img src={roleIcon(role.id)} alt="" width={22} height={22} className="h-[22px] w-[22px]" />
                    <span className={roleSide(role.team) === "evil" ? "text-accent" : undefined}>{roleName(role, locale)}</span>
                    <span className="text-muted">{count}×</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {stats.scripts.length > 0 && (
            <p className="text-sm">
              <span className="text-muted">{m.scripts}:</span> {stats.scripts.slice(0, 5).map((s) => `${s.name} ${s.count}×`).join(" · ")}
            </p>
          )}
          {stats.played === 0 && stats.storytold === 0 && <p className="text-sm text-muted">{m.noGames}</p>}
        </section>
      )}
      {nights.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{m.past}</h2>
          <ol className="flex flex-col gap-2">
            {nights.map((r, i) => {
              const games = gamesOf.get(r.sessionId) ?? [];
              const mine = games.flatMap((g) =>
                g.roster
                  .filter((p) => p.registrationId === r.id)
                  .flatMap((p) => {
                    if (p.role === STORYTELLER) return [t.session.storytellerLabel];
                    const role = findRole(p.role);
                    return role ? [roleName(role, locale)] : [];
                  }),
              );
              const head = (
                <>
                  <span className="font-semibold">{r.session.title}</span>
                  <span className="text-muted"> · {formatDate(r.session.startsAt, locale)}</span>
                  {games.length > 0 && <span className="text-muted"> · {m.gamesCount(games.length)}</span>}
                  {mine.length > 0 && (
                    <span className="mt-0.5 block text-xs text-muted">
                      {m.youPlayed}: {mine.join(", ")}
                    </span>
                  )}
                </>
              );
              return (
                <li key={r.id}>
                  {games.length === 0 ? (
                    <div className={box}>{head}</div>
                  ) : (
                    <details open={i === 0} className={box}>
                      <summary className="cursor-pointer select-none hover:text-accent">{head}</summary>
                      <ol className="mt-3 flex flex-col gap-3">
                        {games.map((g, n) => (
                          <GameCard key={g.id} game={g} number={n + 1} locale={locale} t={t} me={me} />
                        ))}
                      </ol>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
          {anyIcon && <p className="text-xs text-muted">{t.archive.iconsCredit}</p>}
        </section>
      )}
    </div>
  );
}
