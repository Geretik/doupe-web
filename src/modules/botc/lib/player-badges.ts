import { botcRoles, editionOfScript, findRole, roleSide, STORYTELLER, type RoleTeam } from "@/modules/botc/lib/botc-roles";
import type { GameWinner } from "@/db/schema";

type BadgeGame = { sessionId: number; scriptName: string; winner: GameWinner | null; roster: { registrationId: number; role: string | null }[] };

/** In the order the player sees them; names and how to earn them are in the dictionaries (myGames.badges). */
export const badgeIds = [
  "firstBlood",
  "regular",
  "localLegend",
  "tillDawn",
  "bothSides",
  "demonWin",
  "everyTeam",
  "unknowing",
  "traveller",
  "manyFaces",
  "wholeTb",
  "threeWorlds",
  "hotStreak",
  "storyteller",
  "masterStoryteller",
] as const;
export type BadgeId = (typeof badgeIds)[number];

/** `have` of `need` (capped at `need`): a badge is earned once the player has all it needs. */
export type Badge = { id: BadgeId; have: number; need: number; earned: boolean };

/** Characters who don't know who they are; any of them earns "unknowing". */
export const UNKNOWING = ["drunk", "lunatic", "marionette"] as const;
const playerTeams: readonly RoleTeam[] = ["townsfolk", "outsider", "minion", "demon"];
/** Trouble Brewing's characters without its travellers – all of them earn "wholeTb" */
export const TB_CHARACTERS = botcRoles.filter((r) => r.edition === "tb" && r.team !== "traveller").length;

/**
 * The player's badges, earned or not, from the games organisers recorded (never from a grimoire, which most games
 * don't go through): `nights` they came to, and the games of those nights, oldest first. Sides and wins go by the
 * character at the start of the game, as in playerStats; travellers count to neither side.
 */
export function playerBadges(me: ReadonlySet<number>, nights: number, games: BadgeGame[]): Badge[] {
  let played = 0;
  let storytold = 0;
  let demonWins = 0;
  let unknowing = 0;
  let travellers = 0;
  let streak = 0;
  let bestStreak = 0;
  const won = new Set<"good" | "evil">();
  const teams = new Set<RoleTeam>();
  const roles = new Set<string>();
  const editions = new Set<string>();
  const perNight = new Map<number, number>();
  for (const g of games) {
    const role = g.roster.find((p) => me.has(p.registrationId))?.role;
    if (role === STORYTELLER) storytold++;
    const character = findRole(role);
    if (!character) continue;
    played++;
    perNight.set(g.sessionId, (perNight.get(g.sessionId) ?? 0) + 1);
    roles.add(character.id);
    teams.add(character.team);
    if ((UNKNOWING as readonly string[]).includes(character.id)) unknowing++;
    const edition = editionOfScript(g.scriptName);
    if (edition) editions.add(edition);
    const side = roleSide(character.team);
    if (!side) travellers++;
    // a streak goes on over games without a winner or as a traveller, and ends with a lost one
    if (!side || !g.winner) continue;
    if (g.winner !== side) {
      streak = 0;
      continue;
    }
    won.add(side);
    bestStreak = Math.max(bestStreak, ++streak);
    if (character.team === "demon") demonWins++;
  }
  const tb = [...roles].filter((id) => findRole(id)?.edition === "tb" && findRole(id)?.team !== "traveller").length;
  const goals: Record<BadgeId, [have: number, need: number]> = {
    firstBlood: [played, 1],
    regular: [nights, 5],
    localLegend: [nights, 20],
    tillDawn: [Math.max(0, ...perNight.values()), 3],
    bothSides: [won.size, 2],
    demonWin: [demonWins, 1],
    everyTeam: [playerTeams.filter((team) => teams.has(team)).length, playerTeams.length],
    unknowing: [unknowing, 1],
    traveller: [travellers, 1],
    manyFaces: [roles.size, 10],
    wholeTb: [tb, TB_CHARACTERS],
    threeWorlds: [editions.size, 3],
    hotStreak: [bestStreak, 3],
    storyteller: [storytold, 1],
    masterStoryteller: [storytold, 10],
  };
  return badgeIds.map((id) => {
    const [have, need] = goals[id];
    return { id, have: Math.min(have, need), need, earned: have >= need };
  });
}
