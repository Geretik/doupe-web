import { findRole, roleSide, STORYTELLER, type BotcRole } from "@/modules/botc/lib/botc-roles";
import type { GameWinner } from "@/db/schema";

type PlayedGame = { scriptName: string; winner: GameWinner | null; roster: { registrationId: number; role: string | null }[] };

/**
 * One player's record from the recorded games: how many they played and ran, for which side, how often
 * that side won, and their characters and scripts, most played first. The side is the character's at the
 * start of the game; travellers pick theirs when they join, which is not recorded, so they count to neither.
 */
export function playerStats(me: ReadonlySet<number>, games: PlayedGame[]) {
  let played = 0;
  let storytold = 0;
  const sides = { good: 0, evil: 0, travellers: 0 };
  /** games with a recorded winner, and the won ones, per side */
  const decided = { good: 0, evil: 0 };
  const won = { good: 0, evil: 0 };
  const roles = new Map<string, { role: BotcRole; count: number }>();
  const scripts = new Map<string, number>();
  for (const g of games) {
    const entry = g.roster.find((p) => me.has(p.registrationId));
    if (entry?.role === STORYTELLER) storytold++;
    const role = findRole(entry?.role);
    // not at the table, or sat this game out
    if (!role) continue;
    played++;
    roles.set(role.id, { role, count: (roles.get(role.id)?.count ?? 0) + 1 });
    scripts.set(g.scriptName, (scripts.get(g.scriptName) ?? 0) + 1);
    const side = roleSide(role.team);
    if (!side) {
      sides.travellers++;
      continue;
    }
    sides[side]++;
    if (g.winner) {
      decided[side]++;
      if (g.winner === side) won[side]++;
    }
  }
  const mostFirst = (a: { count: number }, b: { count: number }) => b.count - a.count;
  return {
    played,
    storytold,
    sides,
    decided,
    won,
    roles: [...roles.values()].sort(mostFirst),
    scripts: [...scripts].map(([name, count]) => ({ name, count })).sort(mostFirst),
  };
}

export type PlayerStats = ReturnType<typeof playerStats>;
