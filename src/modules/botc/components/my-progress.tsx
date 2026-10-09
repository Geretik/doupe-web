import type { Dict, Locale } from "@/i18n/dictionaries";
import { botcRoles, roleIcon, roleName, roleSide, type RoleEdition } from "@/modules/botc/lib/botc-roles";
import type { Badge, BadgeId } from "@/modules/botc/lib/player-badges";
import type { PlayerStats } from "@/modules/botc/lib/player-stats";

type Group = RoleEdition | "travellers";
const groups: Group[] = ["tb", "bmr", "snv", "carousel", "travellers"];
/** The base editions show the characters still to play too; the experimental ones and the travellers are too many */
const whole = new Set<Group>(["tb", "bmr", "snv"]);

/**
 * The player's characters by edition as a collection: an edition shows once they played one of its characters,
 * the base editions with the rest greyed out.
 */
export function MyCharacters({ roles, locale, m }: { roles: PlayerStats["roles"]; locale: Locale; m: Dict["myGames"] }) {
  const counts = new Map(roles.map(({ role, count }) => [role.id, count]));
  const sections = groups.flatMap((group) => {
    const all = botcRoles.filter((r) => (group === "travellers" ? r.team === "traveller" : r.edition === group && r.team !== "traveller"));
    const mine = all.filter((r) => counts.has(r.id)).length;
    return mine ? [{ group, all, mine, shown: whole.has(group) ? all : all.filter((r) => counts.has(r.id)) }] : [];
  });
  if (!sections.length) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="my-characters">
      <div>
        <h3 className="text-sm font-semibold">{m.roles}</h3>
        <p className="text-xs text-muted">{m.rolesHint}</p>
      </div>
      {sections.map(({ group, all, mine, shown }) => (
        <div key={group} className="flex flex-col gap-2" data-edition={group}>
          <p className="text-xs font-semibold text-muted">
            {m.editions[group]} · {whole.has(group) ? `${mine} / ${all.length}` : mine}
          </p>
          <ul className="grid grid-cols-5 gap-x-2 gap-y-3 sm:grid-cols-8">
            {shown.map((r) => {
              const n = counts.get(r.id) ?? 0;
              return (
                <li key={r.id} data-played={n > 0} className={`flex flex-col items-center gap-1 text-center text-[11px] leading-tight ${n ? "" : "opacity-40"}`}>
                  <span className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized WebP from public/, no optimisation needed */}
                    <img src={roleIcon(r.id)} alt="" width={40} height={40} className={`h-10 w-10 ${n ? "" : "grayscale"}`} />
                    {n > 0 && (
                      <span className="absolute -right-2 -bottom-1 rounded-full border border-border bg-card px-1 text-[10px] font-semibold">{n}×</span>
                    )}
                  </span>
                  <span className={n === 0 ? "text-muted" : roleSide(r.team) === "evil" ? "text-accent" : undefined}>{roleName(r, locale)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

const badgeIcons: Record<BadgeId, string> = {
  firstBlood: "🩸",
  regular: "🕯️",
  localLegend: "🗝️",
  tillDawn: "🌅",
  bothSides: "⚖️",
  demonWin: "😈",
  everyTeam: "🎨",
  unknowing: "🍺",
  traveller: "🧳",
  manyFaces: "🎭",
  wholeTb: "🧪",
  threeWorlds: "🗺️",
  hotStreak: "🔥",
  storyteller: "📜",
  masterStoryteller: "🪶",
};

/** The player's badges, the earned ones first; the rest greyed out, with how far the player got where it takes more. */
export function MyBadges({ badges, m }: { badges: Badge[]; m: Dict["myGames"] }) {
  const earned = badges.filter((b) => b.earned);
  return (
    <section className="flex flex-col gap-3" data-testid="my-badges">
      <div>
        <h2 className="text-lg font-semibold">{m.badgesTitle}</h2>
        <p className="text-sm text-muted">{m.badgesCount(earned.length, badges.length)}</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[...earned, ...badges.filter((b) => !b.earned)].map((b) => (
          <li
            key={b.id}
            data-badge={b.id}
            data-earned={b.earned}
            className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${b.earned ? "border-accent/40 bg-accent/5 shadow-sm" : "border-border bg-card"}`}
          >
            <span aria-hidden className={`w-8 shrink-0 text-center text-2xl leading-none ${b.earned ? "" : "opacity-40 grayscale"}`}>{badgeIcons[b.id]}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={`font-semibold ${b.earned ? "" : "text-muted"}`}>{m.badges[b.id].name}</span>
              <span className="text-xs text-muted">{m.badges[b.id].how}</span>
              {!b.earned && b.need > 1 && (
                <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                    <span className="block h-full rounded-full bg-accent/60" style={{ width: `${(b.have / b.need) * 100}%` }} />
                  </span>
                  {b.have} / {b.need}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
