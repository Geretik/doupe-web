import type { GameWinner } from "@/db/schema";
import { BLUFF_COUNT, bluffTeams, findRole, linkedRoleOf, roleSide, type RoleTeam } from "@/lib/botc-roles";
import type { GrimoireCharacter } from "./characters";

/**
 * The grimoire of one game, saved as a whole by its page (grimoires.state). Plain data and pure functions,
 * shared by the page in the browser and the server that checks and stores it.
 */

/** A reminder token at a seat: the character it belongs to (its icon) and its text; null = the Storyteller's own note */
export type GrimoireReminder = { id: string; roleId: string | null; text: string };

export type GrimoireSeat = {
  id: string;
  name: string;
  /** The sign-up this seat is when the grimoire came from a session: the player of the game record */
  registrationId: number | null;
  role: string | null;
  /** Who a Drunk, Lunatic or Marionette thinks they are, the Townsfolk a Pixie learns, whose ability a Philosopher or Apprentice took (linkedRoleOf) */
  believedRole: string | null;
  dead: boolean;
  /** A dead player's one vote is spent */
  voteUsed: boolean;
  reminders: GrimoireReminder[];
};

export type GrimoirePhase = "setup" | "night" | "day" | "ended";

export type GrimoireState = {
  /** The characters to play with: a script of the club's library (id) or every character (id null) */
  script: { id: number | null; name: string; roleIds: string[] };
  /** In seating order, clockwise from the top */
  seats: GrimoireSeat[];
  /** Characters the Storyteller put in the bag to hand out at random */
  bag: string[];
  /** Not-in-play good characters shown to the Demon */
  bluffs: (string | null)[];
  phase: GrimoirePhase;
  /** The current night and the day after it; 0 before the game */
  round: number;
  winner: GameWinner | null;
  /** Steps of the current night that are done (NightStep ids) */
  nightDone: string[];
};

/** Up to this many seats; the official game goes to 15 players and a few travellers. */
export const MAX_SEATS = 24;
export const MAX_REMINDERS = 12;

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function newSeat(name: string, registrationId: number | null = null): GrimoireSeat {
  return { id: uid(), name, registrationId, role: null, believedRole: null, dead: false, voteUsed: false, reminders: [] };
}

export function newGrimoireState(script: GrimoireState["script"], seats: GrimoireSeat[]): GrimoireState {
  return { script, seats, bag: [], bluffs: Array(BLUFF_COUNT).fill(null), phase: "setup", round: 0, winner: null, nightDone: [] };
}

/** The four teams a game is set up from; travellers come on top. */
export const setupTeams = ["townsfolk", "outsider", "minion", "demon"] as const satisfies readonly RoleTeam[];
export type SetupTeam = (typeof setupTeams)[number];

const DISTRIBUTION: Record<number, [number, number, number, number]> = {
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
};

/** How many characters of each team the rulebook gives a number of players (travellers not counted); null under 5. */
export function distribution(players: number): Record<SetupTeam, number> | null {
  if (players < 5) return null;
  const [townsfolk, outsider, minion, demon] = DISTRIBUTION[Math.min(players, 15)];
  return { townsfolk, outsider, minion, demon };
}

export function isTraveller(roleId: string | null) {
  return findRole(roleId)?.team === "traveller";
}

/** Players the setup counts: every seat but those with a traveller. */
export function playerSeats(state: Pick<GrimoireState, "seats">) {
  return state.seats.filter((s) => !isTraveller(s.role));
}

export function teamCounts(roleIds: (string | null)[]): Record<RoleTeam, number> {
  const counts: Record<RoleTeam, number> = { townsfolk: 0, outsider: 0, minion: 0, demon: 0, traveller: 0 };
  for (const id of roleIds) {
    const team = findRole(id)?.team;
    if (team) counts[team]++;
  }
  return counts;
}

/** "[+2 Outsiders]" of a character that changes the setup, from the end of its ability. */
export function setupNote(ability: string) {
  return ability.match(/\[[^\]]+\]/)?.[0] ?? null;
}

/** Hands the bag out to the seats without a traveller at random; null when the bag does not fit them. */
export function dealBag(state: GrimoireState, random: () => number = Math.random): GrimoireState | null {
  const seats = playerSeats(state);
  if (seats.length === 0 || state.bag.length !== seats.length) return null;
  const bag = [...state.bag];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  const dealt = new Map(seats.map((s, i) => [s.id, bag[i]]));
  return {
    ...state,
    seats: state.seats.map((s) => (dealt.has(s.id) ? { ...s, role: dealt.get(s.id)!, believedRole: null } : s)),
  };
}

/** Characters at the table: the seats' and the ones a Drunk, Philosopher… stands in for. */
export function charactersInPlay(state: Pick<GrimoireState, "seats">) {
  const ids = new Set<string>();
  for (const s of state.seats) {
    if (s.role) ids.add(s.role);
    if (s.believedRole) ids.add(s.believedRole);
  }
  return ids;
}

/** Good characters of the script that nobody has: what the Demon may be shown. */
export function bluffCandidates(state: GrimoireState) {
  const inPlay = new Set(state.seats.map((s) => s.role));
  return state.script.roleIds.filter((id) => {
    const team = findRole(id)?.team;
    return team && bluffTeams.includes(team) && !inPlay.has(id);
  });
}

export const specialSteps = ["dusk", "minionInfo", "demonInfo", "dawn"] as const;
export type SpecialStep = (typeof specialSteps)[number];

/** Where the steps that are no character go in the night order (the script tool's numbers). */
const SPECIAL_ORDER: { first: Partial<Record<SpecialStep, number>>; other: Partial<Record<SpecialStep, number>> } = {
  first: { dusk: 1, minionInfo: 19, demonInfo: 23, dawn: 77 },
  other: { dusk: 1, dawn: 98 },
};

/** One step of a night: a character waking (with the seats that wake as it) or a step that is no character. */
export type NightStep = { id: string; order: number; roleId: string | null; special: SpecialStep | null; seatIds: string[] };

/**
 * The night's steps in order: the characters in play that act on this night, each with the seats that wake
 * for it – a Drunk, Lunatic or Marionette under the character they think they are, a Philosopher or Apprentice
 * also under the ability they took. Dead players' steps stay in (some act when they die).
 */
export function nightSteps(state: Pick<GrimoireState, "seats">, characters: Record<string, GrimoireCharacter>, first: boolean): NightStep[] {
  const steps = new Map<string, NightStep>();
  const wake = (roleId: string, seatId: string) => {
    const c = characters[roleId];
    const order = c ? (first ? c.firstNight : c.otherNight) : 0;
    if (!order) return;
    const step = steps.get(roleId) ?? { id: roleId, order, roleId, special: null, seatIds: [] };
    if (!step.seatIds.includes(seatId)) step.seatIds.push(seatId);
    steps.set(roleId, step);
  };
  for (const s of state.seats) {
    if (s.role) wake(s.role, s.id);
    const linked = linkedRoleOf(s.role);
    if (s.believedRole && linked && linked.kind !== "knows") wake(s.believedRole, s.id);
  }
  const teamSeats = (team: RoleTeam) =>
    state.seats
      .filter((s) => findRole(s.role)?.team === team || (linkedRoleOf(s.role)?.kind === "as" && findRole(s.believedRole)?.team === team))
      .map((s) => s.id);
  const order = first ? SPECIAL_ORDER.first : SPECIAL_ORDER.other;
  for (const special of specialSteps) {
    const at = order[special];
    if (!at) continue;
    const seatIds = special === "minionInfo" ? teamSeats("minion") : special === "demonInfo" ? teamSeats("demon") : [];
    steps.set(special, { id: special, order: at, roleId: null, special, seatIds });
  }
  return [...steps.values()].sort((a, b) => a.order - b.order);
}

/** The phase after this one: setup → night 1 → day 1 → night 2 … */
export function nextPhase(state: GrimoireState): GrimoireState {
  if (state.phase === "setup" || state.phase === "day") return { ...state, phase: "night", round: state.round + 1, nightDone: [] };
  if (state.phase === "night") return { ...state, phase: "day" };
  return state;
}

export function endGame(state: GrimoireState, winner: GameWinner | null): GrimoireState {
  return { ...state, phase: "ended", winner };
}

/** Back into the game after it was ended by mistake: the day of the last round. */
export function reopenGame(state: GrimoireState): GrimoireState {
  return { ...state, phase: state.round > 0 ? "day" : "setup", winner: null };
}

/** Living players and the votes needed to execute: at least half of them. */
export function voteMath(state: Pick<GrimoireState, "seats">) {
  const alive = state.seats.filter((s) => !s.dead).length;
  const votes = state.seats.filter((s) => !s.dead || !s.voteUsed).length;
  return { alive, votes, toExecute: Math.ceil(alive / 2) };
}

/** Good, evil or neither (a traveller, no character) – the colour of a seat. */
export function seatSide(seat: Pick<GrimoireSeat, "role">) {
  const role = findRole(seat.role);
  return role ? roleSide(role.team) : null;
}
