import type { GameWinner } from "@/db/schema";
import { BLUFF_COUNT, bluffTeams, findRole, linkedRoleOf, roleSide, type RoleTeam } from "@/lib/botc-roles";
import type { GrimoireCharacter } from "./characters";

/**
 * The grimoire of one game, saved as a whole by its page (grimoires.state). Plain data and pure functions,
 * shared by the page in the browser and the server that checks and stores it.
 */

/** A reminder token at a seat: the character it belongs to (its icon) and its text; null = the Storyteller's own note */
export type GrimoireReminder = { id: string; roleId: string | null; text: string };

/** Places in the circle that are no player: a gap for the door, the Storyteller's spot in front of the grimoire. */
export const gapKinds = ["door", "storyteller"] as const;
export type GapKind = (typeof gapKinds)[number];

export type GrimoireSeat = {
  id: string;
  /** A gap in the circle instead of a player (no name, character or reminders); absent = a player */
  gap?: GapKind;
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
  /** The characters to play with: a script of the club's library (id), one pasted as JSON (json), else every character */
  script: { id: number | null; json?: boolean; name: string; roleIds: string[] };
  /** The circle in seating order, clockwise: the players and the gaps between them */
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
  /** The players are drawing their characters from the bag on the tablet: the grimoire is hidden */
  drawing?: boolean;
  /** The seating is done: the places in the town can no longer be dragged */
  seatsLocked?: boolean;
  /** The Storyteller's note on the game, written when it ends; goes into the game record */
  notes?: string;
};

/** Up to this many places in the circle; the official game goes to 15 players and a few travellers, then the gaps. */
export const MAX_SEATS = 30;
export const MAX_REMINDERS = 12;

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function newSeat(name: string, registrationId: number | null = null): GrimoireSeat {
  return { id: uid(), name, registrationId, role: null, believedRole: null, dead: false, voteUsed: false, reminders: [] };
}

export function newGap(gap: GapKind): GrimoireSeat {
  return { ...newSeat(""), gap };
}

export function isPlayer(seat: Pick<GrimoireSeat, "gap">) {
  return !seat.gap;
}

/**
 * The place at `from` put at `to` the shorter way round the circle: the places in between move one step towards
 * `from`, all the others stay where they are. Next to each other it is a swap.
 */
export function moveSeat<T>(seats: T[], from: number, to: number): T[] {
  const n = seats.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return seats;
  const forward = (to - from + n) % n;
  const step = forward <= n - forward ? 1 : -1;
  const moved = [...seats];
  for (let i = from; i !== to; i = (i + step + n) % n) moved[i] = seats[(i + step + n) % n];
  moved[to] = seats[from];
  return moved;
}

/** The players in the circle, without the gaps. */
export function players(state: Pick<GrimoireState, "seats">) {
  return state.seats.filter(isPlayer);
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

/** The teams whose number a character can change; the Townsfolk make up the rest */
const countTeams = ["outsider", "minion", "demon"] as const;
type CountTeam = (typeof countTeams)[number];

/**
 * How a character changes the rulebook's numbers ("[+2 Outsiders]"): the Storyteller picks one of `options`,
 * `none` teams get no character in the bag, `open` ones any number. Notes that change no count (the Atheist's
 * good team aside, the Marionette, the Village Idiot…) and the ones the bag cannot show (Lil' Monsta, Legion)
 * are only shown, not counted.
 */
const SETUP_EFFECTS: Record<string, { options?: Partial<Record<CountTeam, number>>[]; none?: CountTeam[]; open?: CountTeam[] }> = {
  baron: { options: [{ outsider: 2 }] },
  fanggu: { options: [{ outsider: 1 }] },
  vigormortis: { options: [{ outsider: -1 }] },
  godfather: { options: [{ outsider: -1 }, { outsider: 1 }] },
  balloonist: { options: [{}, { outsider: 1 }] },
  hermit: { options: [{}, { outsider: -1 }] },
  // the Damsel, an Outsider, instead of a Townsfolk
  huntsman: { options: [{ outsider: 1 }] },
  summoner: { none: ["demon"] },
  atheist: { none: ["minion", "demon"] },
  // the Kazali makes the Minions at night
  kazali: { none: ["minion"], open: ["outsider"] },
  lordoftyphon: { options: [{ minion: 1 }], open: ["outsider"] },
  xaan: { open: ["outsider"] },
};

/** A team's number for a game: the rulebook's, the values the characters allow (several when one leaves a choice; null = any), and who changed it. */
export type ExpectedCount = { base: number; values: number[] | null; by: string[] };

/**
 * The extra token a character who thinks they are someone else brings into the bag (hiddenInBag), one of `options`:
 * a Townsfolk for the Drunk, a good character for the Marionette, a second Demon for the Lunatic, who may do
 * without one and think they are the Demon in play.
 */
const STAND_INS: Record<string, Partial<Record<SetupTeam, number>>[]> = {
  drunk: [{ townsfolk: 1 }],
  marionette: [{ townsfolk: 1 }, { outsider: 1 }],
  lunatic: [{ demon: 1 }, {}],
};

/**
 * The setup for the players with these characters in play (the bag, or the seats); null under 5 players.
 * For the bag (`bag`), with the extra tokens a Drunk, Lunatic or Marionette brings.
 */
export function expectedSetup(players: number, roleIds: (string | null)[], bag = false): Record<SetupTeam, ExpectedCount> | null {
  const base = distribution(players);
  if (!base) return null;
  const ids = [...new Set(roleIds)];
  const effects = ids.flatMap((id) => (id && SETUP_EFFECTS[id] ? [{ id, ...SETUP_EFFECTS[id] }] : []));
  let combos: Record<CountTeam, number>[] = [{ outsider: 0, minion: 0, demon: 0 }];
  for (const { options } of effects) {
    if (options) combos = combos.flatMap((c) => options.map((o) => ({ outsider: c.outsider + (o.outsider ?? 0), minion: c.minion + (o.minion ?? 0), demon: c.demon + (o.demon ?? 0) })));
  }
  const standIns = bag ? ids.flatMap((id) => (id && STAND_INS[id] ? [{ id, options: STAND_INS[id] }] : [])) : [];
  let extras: Partial<Record<SetupTeam, number>>[] = [{}];
  for (const { options } of standIns) {
    extras = extras.flatMap((x) => options.map((o) => Object.fromEntries(setupTeams.map((team) => [team, (x[team] ?? 0) + (o[team] ?? 0)]))));
  }
  const none = new Set(effects.flatMap((e) => e.none ?? []));
  const open = new Set(effects.flatMap((e) => e.open ?? []));
  const values: Record<SetupTeam, Set<number>> = { townsfolk: new Set(), outsider: new Set(), minion: new Set(), demon: new Set() };
  for (const c of combos) {
    const n = { outsider: 0, minion: 0, demon: 0 };
    for (const team of countTeams) n[team] = none.has(team) ? 0 : Math.max(0, base[team] + c[team]);
    for (const x of extras) {
      for (const team of countTeams) values[team].add(n[team] + (x[team] ?? 0));
      values.townsfolk.add(Math.max(0, players - n.outsider - n.minion - n.demon) + (x.townsfolk ?? 0));
    }
  }
  const changes = (team: SetupTeam) => (e: (typeof effects)[number]) =>
    team === "townsfolk" || e.options?.some((o) => o[team]) || e.none?.includes(team) || e.open?.includes(team);
  return Object.fromEntries(
    setupTeams.map((team) => [
      team,
      {
        base: base[team],
        values: open.has(team as CountTeam) || (team === "townsfolk" && open.size > 0) ? null : [...values[team]].sort((a, b) => a - b),
        by: [...effects.filter(changes(team)).map((e) => e.id), ...standIns.filter((s) => s.options.some((o) => o[team])).map((s) => s.id)],
      },
    ]),
  ) as Record<SetupTeam, ExpectedCount>;
}

/**
 * Characters in the bag through a stand-in, as in the rulebook: the player who gets the extra token of the team
 * they think they are (STAND_INS) is them, and thinks they are that token. The Lunatic only with a second Demon
 * in the bag; without one they go to a player as themselves.
 */
export function hiddenInBag(bag: string[]) {
  const demons = bag.filter((id) => findRole(id)?.team === "demon").length;
  return bag.filter((id) => linkedRoleOf(id)?.kind === "as" && (id !== "lunatic" || demons > 1));
}

/** The tokens that go round with the bag, one for each player: the bag without the characters behind a stand-in. */
export function bagTokens(bag: string[]) {
  const hidden = new Set(hiddenInBag(bag));
  return bag.filter((id) => !hidden.has(id));
}

/** The characters the setup counts with: the bag while it is being filled, else the seats'. */
export function setupRoles(state: Pick<GrimoireState, "bag" | "seats">) {
  return state.bag.length ? state.bag : state.seats.map((s) => s.role);
}

/** A number of a team that the setup does not allow */
export function offCount(expected: ExpectedCount | undefined, n: number) {
  return !!expected?.values && !expected.values.includes(n);
}

export function isTraveller(roleId: string | null) {
  return findRole(roleId)?.team === "traveller";
}

/** Players the setup counts: every player but those with a traveller. */
export function playerSeats(state: Pick<GrimoireState, "seats">) {
  return players(state).filter((s) => !isTraveller(s.role));
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

/** The players either side of a player in the circle, the gaps skipped. */
export function neighbours(state: Pick<GrimoireState, "seats">, seatId: string) {
  const ring = players(state);
  const i = ring.findIndex((s) => s.id === seatId);
  if (i < 0 || ring.length < 2) return [];
  return [ring[(i - 1 + ring.length) % ring.length].id, ring[(i + 1) % ring.length].id];
}

/** A Marionette at the table who does not neighbour the Demon, against their setup rule. */
export function marionetteApart(state: Pick<GrimoireState, "seats">) {
  const marionette = state.seats.find((s) => s.role === "marionette");
  const demons = players(state).filter((s) => findRole(s.role)?.team === "demon");
  return !!marionette && demons.length > 0 && !demons.some((d) => neighbours(state, d.id).includes(marionette.id));
}

/** First the Lunatic (which Demon is the real one), then the Marionette next to it, the Drunk last. */
const STAND_IN_ORDER = ["lunatic", "marionette", "drunk"];

/**
 * Who of the players is a character the bag held through a stand-in (hiddenInBag): a random player with a token
 * of the team they think they are becomes them and thinks they are that token; the Marionette one of the Demon's
 * neighbours, or any good player when no good player neighbours the Demon (marionetteApart then says so).
 */
export function resolveStandIns(state: GrimoireState, random: () => number = Math.random): GrimoireState {
  let seats = state.seats;
  const hidden = new Set(hiddenInBag(state.bag));
  for (const id of STAND_IN_ORDER) {
    if (!hidden.has(id) || seats.some((s) => s.role === id)) continue;
    const teams: readonly RoleTeam[] = linkedRoleOf(id)?.teams ?? [];
    // a player already standing in for another of them keeps their token
    const holding = playerSeats({ seats }).filter((s) => linkedRoleOf(s.role)?.kind !== "as" && teams.some((team) => findRole(s.role)?.team === team));
    let candidates = holding;
    if (id === "marionette") {
      const demons = players({ seats }).filter((s) => findRole(s.role)?.team === "demon");
      const near = holding.filter((s) => demons.some((d) => neighbours({ seats }, d.id).includes(s.id)));
      if (near.length) candidates = near;
    }
    if (!candidates.length) continue;
    const pick = candidates[Math.floor(random() * candidates.length)];
    seats = seats.map((s) => (s.id === pick.id ? { ...s, role: id, believedRole: s.role } : s));
  }
  return { ...state, seats };
}

/**
 * Hands the bag's tokens out to the seats without a traveller at random, then picks who is a Drunk, Lunatic or
 * Marionette of the bag (resolveStandIns); null when the bag does not fit the seats.
 */
export function dealBag(state: GrimoireState, random: () => number = Math.random): GrimoireState | null {
  const seats = playerSeats(state);
  const tokens = bagTokens(state.bag);
  if (seats.length === 0 || tokens.length !== seats.length) return null;
  // the Marionette must neighbour the Demon: deal again in the rare case that no good player does
  for (let attempt = 0; ; attempt++) {
    const bag = [...tokens];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    const dealt = new Map(seats.map((s, i) => [s.id, bag[i]]));
    const handed = resolveStandIns(
      { ...state, seats: state.seats.map((s) => (dealt.has(s.id) ? { ...s, role: dealt.get(s.id)!, believedRole: null } : s)) },
      random,
    );
    if (marionetteApart(handed) && attempt < 20) continue;
    // a Lunatic without a second Demon in the bag thinks they are the Demon in play
    const demon = handed.seats.find((s) => findRole(s.role)?.team === "demon")?.role ?? null;
    return { ...handed, seats: handed.seats.map((s) => (s.role === "lunatic" && !s.believedRole ? { ...s, believedRole: demon } : s)) };
  }
}

/** Tokens of the bag nobody has drawn yet: a player standing in for a Drunk… holds the token they think they are. */
export function remainingBag(state: Pick<GrimoireState, "seats" | "bag">) {
  const hidden = new Set(hiddenInBag(state.bag));
  const taken = new Set(players(state).map((s) => (s.role && hidden.has(s.role) ? s.believedRole : s.role)));
  return bagTokens(state.bag).filter((id) => !taken.has(id));
}

/** Characters that must not be drawn: the player would see the character they do not know they are (a Lunatic without a second Demon). */
export function undrawable(bag: string[]) {
  const hidden = new Set(hiddenInBag(bag));
  return bag.filter((id) => linkedRoleOf(id)?.kind === "as" && !hidden.has(id));
}

/** The players draw from the bag: the characters of the players without a traveller are taken back first. */
export function startDrawing(state: GrimoireState): GrimoireState {
  return {
    ...state,
    drawing: true,
    seats: state.seats.map((s) => (isPlayer(s) && !isTraveller(s.role) ? { ...s, role: null, believedRole: null } : s)),
  };
}

/** A random character of the bag for a seat that has none yet; null when the bag is empty. */
export function drawFor(state: GrimoireState, seatId: string, random: () => number = Math.random): string | null {
  const left = remainingBag(state);
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat || !isPlayer(seat) || seat.role || left.length === 0) return null;
  return left[Math.floor(random() * left.length)];
}

/** The seat drew this token; with the last one drawn it is decided who of them is a Drunk… of the bag. */
export function takeDrawn(state: GrimoireState, seatId: string, roleId: string): GrimoireState {
  const next = { ...state, seats: state.seats.map((s) => (s.id === seatId ? { ...s, role: roleId } : s)) };
  return remainingBag(next).length ? next : resolveStandIns(next);
}

/** The draw is over (also before everyone drew): back to the grimoire, a Drunk… of the bag decided among those who drew. */
export function endDrawing(state: GrimoireState): GrimoireState {
  return { ...resolveStandIns(state), drawing: false };
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

/** Good characters of the script that nobody has, nobody thinks they are and that are not in the bag: what the Demon may be shown. */
export function bluffCandidates(state: Pick<GrimoireState, "seats" | "bag" | "script">) {
  const taken = new Set([...state.bag, ...charactersInPlay(state)]);
  return state.script.roleIds.filter((id) => {
    const team = findRole(id)?.team;
    return team && bluffTeams.includes(team) && !taken.has(id);
  });
}

function shuffled<T>(items: T[], random: () => number) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Three random bluffs for the Demon (bluffCandidates); fewer when the script has fewer. */
export function randomBluffs(state: Pick<GrimoireState, "seats" | "bag" | "script">, random: () => number = Math.random): (string | null)[] {
  const picked = shuffled(bluffCandidates(state), random).slice(0, BLUFF_COUNT);
  return Array.from({ length: BLUFF_COUNT }, (_, i) => picked[i] ?? null);
}

/**
 * A random bag of the script's characters that fits the players: the Demon first, then as many Minions and
 * Outsiders as the characters so far allow (a Baron's two more…), a second Demon for a Lunatic, Townsfolk for
 * the rest and a Drunk's extra one. Tried again until every team's number fits the setup (a Townsfolk that
 * changes it, like the Atheist, rarely does). Null under 5 players or when the script cannot fill it.
 */
export function randomBag(state: Pick<GrimoireState, "seats" | "script">, random: () => number = Math.random): string[] | null {
  const n = playerSeats(state).length;
  if (!distribution(n)) return null;
  const pool = (team: RoleTeam) => state.script.roleIds.filter((id) => findRole(id)?.team === team);
  const pick = (e: ExpectedCount) => (e.values ? e.values[Math.floor(random() * e.values.length)] : e.base);
  for (let attempt = 0; attempt < 300; attempt++) {
    const bag: string[] = [];
    const add = (team: RoleTeam, k: number) => {
      const picked = shuffled(pool(team).filter((id) => !bag.includes(id)), random).slice(0, Math.max(0, k));
      bag.push(...picked);
      return picked.length === Math.max(0, k);
    };
    if (!add("demon", pick(expectedSetup(n, bag, true)!.demon))) continue;
    if (!add("minion", pick(expectedSetup(n, bag, true)!.minion))) continue;
    if (!add("outsider", pick(expectedSetup(n, bag, true)!.outsider))) continue;
    if (bag.includes("lunatic")) add("demon", 1);
    if (!add("townsfolk", n + hiddenInBag(bag).length - bag.length)) continue;
    const expected = expectedSetup(n, bag, true)!;
    const counts = teamCounts(bag);
    if (setupTeams.every((team) => !offCount(expected[team], counts[team]))) return bag;
  }
  return null;
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

export function endGame(state: GrimoireState, winner: GameWinner | null, notes = state.notes): GrimoireState {
  return { ...state, phase: "ended", winner, notes };
}

/** Back into the game after it was ended by mistake: the day of the last round. */
export function reopenGame(state: GrimoireState): GrimoireState {
  return { ...state, phase: state.round > 0 ? "day" : "setup", winner: null };
}

/** Living players and the votes needed to execute: at least half of them. */
export function voteMath(state: Pick<GrimoireState, "seats">) {
  const alive = players(state).filter((s) => !s.dead).length;
  const votes = players(state).filter((s) => !s.dead || !s.voteUsed).length;
  return { alive, votes, toExecute: Math.ceil(alive / 2) };
}

/**
 * A character's reminder token put on a player. A character has as many of a token as its reminders list
 * (mostly one), so when all are out the new one is moved there: the Poisoner's poison goes to tonight's player.
 */
export function placeReminder(state: GrimoireState, seatId: string, roleId: string, text: string, copies = 1): GrimoireState {
  const placed = state.seats.flatMap((s) => s.reminders.filter((r) => r.roleId === roleId && r.text === text).map((r) => ({ seatId: s.id, id: r.id })));
  if (placed.some((p) => p.seatId === seatId)) return state;
  const moved = placed.length >= Math.max(1, copies) ? placed[0].id : null;
  return {
    ...state,
    seats: state.seats.map((s) => {
      let reminders = moved ? s.reminders.filter((r) => r.id !== moved) : s.reminders;
      if (s.id === seatId) reminders = [...reminders, { id: uid(), roleId, text }].slice(0, MAX_REMINDERS);
      return reminders === s.reminders ? s : { ...s, reminders };
    }),
  };
}

/** A character's reminder tokens in the town, with the players they lie at. */
export function remindersOf(state: Pick<GrimoireState, "seats">, roleId: string) {
  return state.seats.flatMap((seat) => seat.reminders.filter((r) => r.roleId === roleId).map((reminder) => ({ seat, reminder })));
}

/** Pairs of evil players sitting next to each other: the Chef's number (as the characters are, without misregistering). */
export function evilPairs(state: Pick<GrimoireState, "seats">) {
  const ring = players(state);
  if (ring.length < 3) return 0;
  return ring.filter((s, i) => seatSide(s) === "evil" && seatSide(ring[(i + 1) % ring.length]) === "evil").length;
}

/** Evil players among a player's nearest living neighbours: the Empath's number. */
export function evilLivingNeighbours(state: Pick<GrimoireState, "seats">, seatId: string) {
  const ring = players(state);
  const i = ring.findIndex((s) => s.id === seatId);
  if (i < 0) return 0;
  const nearest = (step: number) => {
    for (let k = 1; k < ring.length; k++) {
      const s = ring[(((i + step * k) % ring.length) + ring.length) % ring.length];
      if (!s.dead) return s;
    }
    return null;
  };
  return [...new Set([nearest(-1), nearest(1)])].filter((s) => s && s.id !== seatId && seatSide(s) === "evil").length;
}

/** Why a player's information may be false: they are the Drunk, or lie under a token that makes them drunk or poisoned. */
export function impairment(seat: Pick<GrimoireSeat, "role" | "reminders">, characters: Record<string, GrimoireCharacter>): "drunk" | "poisoned" | null {
  if (seat.role === "drunk") return "drunk";
  for (const r of seat.reminders) {
    const kind = r.roleId ? characters[r.roleId]?.tokenKinds[r.text] : undefined;
    if (kind === "poisoned" || kind === "drunk") return kind;
  }
  return null;
}

/** Good, evil or neither (a traveller, no character) – the colour of a seat. */
export function seatSide(seat: Pick<GrimoireSeat, "role">) {
  const role = findRole(seat.role);
  return role ? roleSide(role.team) : null;
}
