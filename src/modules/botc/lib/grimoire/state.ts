import type { GameWinner } from "@/db/schema";
import { BLUFF_COUNT, bluffTeams, findRole, linkedRoleOf, roleSide, type RoleTeam } from "@/modules/botc/lib/botc-roles";
import type { GrimoireCharacter, TokenKind } from "./characters";

/**
 * The grimoire of one game, saved as a whole by its page (grimoires.state). Plain data and pure functions,
 * shared by the page in the browser and the server that checks and stores it.
 */

/**
 * A reminder token at a seat: the character it belongs to (its icon) and its text; null = the Storyteller's own note.
 * `round`: the night and day it was put down in (tonight's attack, the Minstrel's drunkenness until dusk tomorrow).
 */
export type GrimoireReminder = { id: string; roleId: string | null; text: string; round?: number };

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

/** A script's homebrew character, only to read: no player gets it in the grimoire. `team` as the script says, if it is a known one. */
export type HomebrewCharacter = { name: string; team: string | null; ability: string };

/** What a script brings of its own, which the Bootlegger stands for: its rules (the official "_meta.bootlegger") and characters. */
export type Homebrew = { rules: string[]; characters: HomebrewCharacter[] };

/** Bounds of a script's homebrew kept in a grimoire */
export const HOMEBREW_LIMITS = { rules: 20, characters: 50, name: 80, text: 600 } as const;

export const eventKinds = ["death", "survived", "revived", "became"] as const;

/**
 * What happened in the game, for its chronicle and the rules that look back: a death (by whose ability, the
 * Zombuul's first one only registering), a Demon's attack someone lived through and why, a player brought back,
 * a player who became another character. The player's name and character as they were then.
 */
export type GrimoireEvent = {
  /** The night and day it happened in */
  round: number;
  /** By day; else at night (or before the game) */
  day?: boolean;
  kind: (typeof eventKinds)[number];
  seatId: string;
  name: string;
  role: string | null;
  /** The character whose ability did it: the Demon that killed, who kept them alive or brought them back; the new character */
  by?: string;
  /** The Zombuul's first death: they live on, registering as dead */
  fake?: boolean;
};

export type GrimoireState = {
  /**
   * The characters to play with: a script of the club's library (id), one pasted as JSON (json), else every
   * character; `fabled`: its Fabled and Loric, `homebrew`: its own rules and characters (the Bootlegger's)
   */
  script: { id: number | null; json?: boolean; name: string; roleIds: string[]; fabled?: string[]; homebrew?: Homebrew };
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
  /** What happened, in order (GrimoireEvent); the oldest go beyond MAX_EVENTS */
  log?: GrimoireEvent[];
  /** The Storyteller's Fabled and Loric in the game: the script's, and the ones added for this table */
  fabled?: string[];
};

/** Up to this many places in the circle; the official game goes to 15 players and a few travellers, then the gaps. */
export const MAX_SEATS = 30;
export const MAX_REMINDERS = 12;
export const MAX_EVENTS = 300;

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
  const fabled = script.fabled?.length ? { fabled: [...script.fabled] } : {};
  return { script, seats, bag: [], bluffs: Array(BLUFF_COUNT).fill(null), phase: "setup", round: 0, winner: null, nightDone: [], ...fabled };
}

/** Another script for the game: the bag keeps only its characters, the old script's Fabled and Loric make way for the new one's. */
export function withScript(state: GrimoireState, script: GrimoireState["script"]): GrimoireState {
  const old = new Set(state.script.fabled ?? []);
  const fabled = [...new Set([...(state.fabled ?? []).filter((id) => !old.has(id)), ...(script.fabled ?? [])])];
  return { ...state, script, bag: state.bag.filter((id) => script.roleIds.includes(id)), fabled };
}

/** The Fabled or Loric is in the game. */
export function hasFabled(state: Partial<Pick<GrimoireState, "fabled">>, id: string) {
  return !!state.fabled?.includes(id);
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
 * good team aside, the Marionette, the Village Idiot…) are only shown, not counted. Lil' Monsta is a Demon in
 * the bag that nobody gets (hiddenInBag); with Legion most players are Legion, as many as the Storyteller likes.
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
  // the players: one Minion more and no Demon; the bag holds Lil' Monsta on top (STAND_INS)
  lilmonsta: { options: [{ minion: 1, demon: -1 }] },
  legion: { open: ["outsider", "minion", "demon"] },
  // the Fabled: there might be one Outsider more or fewer
  sentinel: { options: [{}, { outsider: 1 }, { outsider: -1 }] },
};

/** A team's number for a game: the rulebook's, the values the characters allow (several when one leaves a choice; null = any), and who changed it. */
export type ExpectedCount = { base: number; values: number[] | null; by: string[] };

/**
 * The extra token a character who thinks they are someone else brings into the bag (hiddenInBag), one of `options`:
 * a Townsfolk for the Drunk, a good character for the Marionette, a second Demon for the Lunatic, who may do
 * without one and think they are the Demon in play. Lil' Monsta is its own extra token: a Demon nobody gets.
 */
const STAND_INS: Record<string, Partial<Record<SetupTeam, number>>[]> = {
  drunk: [{ townsfolk: 1 }],
  lilmonsta: [{ demon: 1 }],
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

/** Lil' Monsta: the Demon nobody is – the Minions choose each night who babysits its token. */
export const LIL_MONSTA = "lilmonsta";

/** The Loric with duplicate good characters in play */
export const POPE = "pope";

/**
 * A good character the Pope may put in play twice; not one who thinks they are someone else (the Drunk, the
 * Lunatic), as the bag holds them through a stand-in.
 */
export function duplicable(id: string) {
  const team = findRole(id)?.team;
  return (team === "townsfolk" || team === "outsider") && linkedRoleOf(id)?.kind !== "as";
}

/**
 * A tap on a character in the token selection: into the bag, or out of it; with the Pope a good character goes in
 * a second time before it comes out. Legion's number has its own buttons.
 */
export function tapBag(state: GrimoireState, id: string): GrimoireState {
  const n = state.bag.filter((x) => x === id).length;
  const again = n === 1 && hasFabled(state, POPE) && duplicable(id);
  return { ...state, bag: n === 0 || again ? [...state.bag, id] : state.bag.filter((x) => x !== id) };
}

/**
 * Characters in the bag through a stand-in, as in the rulebook: the player who gets the extra token of the team
 * they think they are (STAND_INS) is them, and thinks they are that token. The Lunatic only with a second Demon
 * in the bag; without one they go to a player as themselves. Lil' Monsta goes to nobody: a Minion babysits it.
 */
export function hiddenInBag(bag: string[]) {
  const demons = bag.filter((id) => findRole(id)?.team === "demon").length;
  return bag.filter((id) => id === LIL_MONSTA || (linkedRoleOf(id)?.kind === "as" && (id !== "lunatic" || demons > 1)));
}

/** Lil' Monsta is in the game: in the bag, or its token at a babysitter. */
export function lilMonstaInPlay(state: Pick<GrimoireState, "seats" | "bag">) {
  return state.bag.includes(LIL_MONSTA) || state.seats.some((s) => s.reminders.some((r) => r.roleId === LIL_MONSTA));
}

/** The tokens that go round with the bag, one for each player: the bag without the characters behind a stand-in. */
export function bagTokens(bag: string[]) {
  const hidden = new Set(hiddenInBag(bag));
  return bag.filter((id) => !hidden.has(id));
}

/** The characters the setup counts with: the bag while it is being filled, else the seats'; and the Fabled (the Sentinel). */
export function setupRoles(state: Pick<GrimoireState, "bag" | "seats" | "fabled">) {
  return [...(state.bag.length ? state.bag : state.seats.map((s) => s.role)), ...(state.fabled ?? [])];
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

const TYPHON = "lordoftyphon";
const isEvil = (seat: Pick<GrimoireSeat, "id" | "role" | "reminders">) => seatSide(seat) === "evil";

/**
 * The Lord of Typhon's setup: the evil players sit in a line with it in the middle (both its neighbours evil).
 * Null without a Lord of Typhon at the table; else whether they do.
 */
export function typhonInLine(state: Pick<GrimoireState, "seats">): boolean | null {
  const ring = playerSeats(state);
  const n = ring.length;
  const i = ring.findIndex((s) => s.role === TYPHON);
  if (i < 0) return null;
  let left = 0;
  while (left < n - 1 && isEvil(ring[(i - left - 1 + n) % n])) left++;
  let right = 0;
  while (right < n - 1 - left && isEvil(ring[(i + right + 1) % n])) right++;
  return left >= 1 && right >= 1 && left + right + 1 === ring.filter(isEvil).length;
}

/**
 * The evil players moved into a line round the Lord of Typhon, it in the middle (one more on a random side when
 * the rest are odd): good players in the line swap characters with evil players outside it.
 */
export function lineUpTyphon(state: GrimoireState, random: () => number = Math.random): GrimoireState {
  const ring = playerSeats(state);
  const i = ring.findIndex((s) => s.role === TYPHON);
  const evil = ring.filter(isEvil);
  if (i < 0 || evil.length < 3) return state;
  const others = evil.length - 1;
  const left = Math.floor(others / 2) + (others % 2 && random() < 0.5 ? 1 : 0);
  const line = new Set(evil.map((_, k) => ring[(i - left + k + ring.length) % ring.length].id));
  const incoming = evil.filter((s) => !line.has(s.id));
  const outgoing = ring.filter((s) => line.has(s.id) && !isEvil(s));
  const swap = new Map<string, GrimoireSeat>();
  outgoing.forEach((s, k) => {
    swap.set(s.id, incoming[k]);
    swap.set(incoming[k].id, s);
  });
  return {
    ...state,
    seats: state.seats.map((s) => {
      const other = swap.get(s.id);
      return other ? { ...s, role: other.role, believedRole: other.believedRole } : s;
    }),
  };
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
 * Marionette of the bag (resolveStandIns) and puts the evil players in a line round a Lord of Typhon (lineUpTyphon);
 * null when the bag does not fit the seats.
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
    const resolved = resolveStandIns(
      { ...state, seats: state.seats.map((s) => (dealt.has(s.id) ? { ...s, role: dealt.get(s.id)!, believedRole: null } : s)) },
      random,
    );
    const handed = typhonInLine(resolved) === false ? lineUpTyphon(resolved, random) : resolved;
    if (marionetteApart(handed) && attempt < 20) continue;
    // a Lunatic without a second Demon in the bag thinks they are the Demon in play
    const demon = handed.seats.find((s) => findRole(s.role)?.team === "demon")?.role ?? null;
    return { ...handed, seats: handed.seats.map((s) => (s.role === "lunatic" && !s.believedRole ? { ...s, believedRole: demon } : s)) };
  }
}

/**
 * Tokens of the bag nobody has drawn yet: a player standing in for a Drunk… holds the token they think they are;
 * each player takes one token, so of several Legion the others stay.
 */
export function remainingBag(state: Pick<GrimoireState, "seats" | "bag">) {
  const hidden = new Set(hiddenInBag(state.bag));
  const left = bagTokens(state.bag);
  for (const s of players(state)) {
    const i = left.indexOf((s.role && hidden.has(s.role) ? s.believedRole : s.role) ?? "");
    if (i >= 0) left.splice(i, 1);
  }
  return left;
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

/**
 * Good characters of the script that nobody has, nobody thinks they are and that are not in the bag: what the Demon
 * may be shown. With the Pope the duplicate good characters in play might also be bluffs: any good character.
 */
export function bluffCandidates(state: Pick<GrimoireState, "seats" | "bag" | "script"> & Partial<Pick<GrimoireState, "fabled">>) {
  const taken = new Set(hasFabled(state, POPE) ? [] : [...state.bag, ...charactersInPlay(state)]);
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
export function randomBluffs(state: Pick<GrimoireState, "seats" | "bag" | "script"> & Partial<Pick<GrimoireState, "fabled">>, random: () => number = Math.random): (string | null)[] {
  const picked = shuffled(bluffCandidates(state), random).slice(0, BLUFF_COUNT);
  return Array.from({ length: BLUFF_COUNT }, (_, i) => picked[i] ?? null);
}

/**
 * A random bag of the script's characters that fits the players: the Demon first, then as many Minions and
 * Outsiders as the characters so far allow (a Baron's two more…), a second Demon for a Lunatic, Townsfolk for
 * the rest and a Drunk's extra one; with the Pope one Townsfolk twice. Tried again until every team's number fits
 * the setup (a Townsfolk that changes it, like the Atheist, rarely does). Null under 5 players or when the script
 * cannot fill it.
 */
export function randomBag(state: Pick<GrimoireState, "seats" | "script" | "fabled">, random: () => number = Math.random): string[] | null {
  const n = playerSeats(state).length;
  if (!distribution(n)) return null;
  // how many are Legion is the Storyteller's to choose
  const pool = (team: RoleTeam) => state.script.roleIds.filter((id) => findRole(id)?.team === team && id !== "legion");
  const pick = (e: ExpectedCount) => (e.values ? e.values[Math.floor(random() * e.values.length)] : e.base);
  for (let attempt = 0; attempt < 300; attempt++) {
    const bag: string[] = [];
    const add = (team: RoleTeam, k: number) => {
      const picked = shuffled(pool(team).filter((id) => !bag.includes(id)), random).slice(0, Math.max(0, k));
      bag.push(...picked);
      return picked.length === Math.max(0, k);
    };
    const setup = () => expectedSetup(n, [...bag, ...(state.fabled ?? [])], true)!;
    if (!add("demon", pick(setup().demon))) continue;
    if (!add("minion", pick(setup().minion))) continue;
    if (!add("outsider", pick(setup().outsider))) continue;
    if (bag.includes("lunatic")) add("demon", 1);
    if (!add("townsfolk", n + hiddenInBag(bag).length - bag.length)) continue;
    // the Pope's duplicate: a Townsfolk in place of another
    const doubles = bag.filter((id) => findRole(id)?.team === "townsfolk" && duplicable(id));
    if (hasFabled(state, POPE) && doubles.length >= 2) {
      const [twice, out] = shuffled(doubles, random);
      bag[bag.indexOf(out)] = twice;
    }
    const expected = setup();
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
 * also under the ability they took, a Scarlet Woman who became the Demon by day also as herself (to learn it),
 * the living Minions for Lil' Monsta (they choose its babysitter), the Demon also under the ability the Boffin
 * gave it, the Hermit under every Outsider of the script, the Cannibal under their last executee. The Lunatic acts
 * their Demon at their own step only. The Fabled and Loric that act at night have their step too: the Storm
 * Catcher's wakes the evil players, the Duchess's her visitors. With fewer than 7 players the evil players do
 * not learn each other (no Minion and Demon info), unless the Toymaker gives them their starting info.
 * Dead players' steps stay in (some act when they die).
 */
export function nightSteps(
  state: Pick<GrimoireState, "seats" | "bag" | "round" | "log"> & Partial<Pick<GrimoireState, "script" | "fabled">>,
  characters: Record<string, GrimoireCharacter>,
  first: boolean,
): NightStep[] {
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
    // the Lunatic acts the Demon at their own step
    if (s.believedRole && (linked?.kind === "as" || linked?.kind === "ability") && s.role !== "lunatic") wake(s.believedRole, s.id);
    if (s.role === "hermit") state.script?.roleIds.filter((id) => hermitHas(state, s, id)).forEach((id) => wake(id, s.id));
    const meal = s.role === "cannibal" && !s.dead ? cannibalAte(state)?.role : null;
    if (meal) wake(meal, s.id);
  }
  // the Demon has the ability the Boffin gave it, while the Boffin's works
  for (const boffin of players(state).filter((s) => s.role === "boffin" && s.believedRole && !s.dead && !impairment(state, s, characters))) {
    players(state).forEach((s) => findRole(s.role)?.team === "demon" && wake(boffin.believedRole!, s.id));
  }
  const becameToday = (state.log ?? []).filter((e) => e.kind === "became" && e.day && e.round === state.round - 1 && e.role === "scarletwoman");
  if (!first) becameToday.forEach((e) => wake("scarletwoman", e.seatId));
  if (lilMonstaInPlay(state)) players(state).forEach((s) => !s.dead && findRole(s.role)?.team === "minion" && wake(LIL_MONSTA, s.id));
  for (const id of state.fabled ?? []) {
    const c = characters[id];
    const at = c ? (first ? c.firstNight : c.otherNight) : 0;
    if (!at) continue;
    const seatIds =
      id === "stormcatcher"
        ? players(state).filter((s) => seatSide(s, characters, state) === "evil").map((s) => s.id)
        : id === "duchess"
          ? [...new Set(remindersOf(state, id).map(({ seat }) => seat.id))]
          : [];
    steps.set(id, { id, order: at, roleId: id, special: null, seatIds });
  }
  const teamSeats = (team: RoleTeam) =>
    state.seats
      .filter((s) => findRole(s.role)?.team === team || (linkedRoleOf(s.role)?.kind === "as" && findRole(s.believedRole)?.team === team))
      .map((s) => s.id);
  const order = first ? SPECIAL_ORDER.first : SPECIAL_ORDER.other;
  const evilInfo = playerSeats(state).length >= 7 || hasFabled(state, "toymaker");
  for (const special of specialSteps) {
    const at = order[special];
    if (!at || (!evilInfo && (special === "minionInfo" || special === "demonInfo"))) continue;
    const seatIds = special === "minionInfo" ? teamSeats("minion") : special === "demonInfo" ? teamSeats("demon") : [];
    steps.set(special, { id: special, order: at, roleId: null, special, seatIds });
  }
  return [...steps.values()].sort((a, b) => a.order - b.order);
}

/**
 * Tokens that last until dusk: the Poisoner's poison (tonight and tomorrow day), the drunkenness of the Organ
 * Grinder, Sailor, Innkeeper and Goon, the Witch's curse.
 */
const UNTIL_DUSK: Record<string, TokenKind[]> = {
  poisoner: ["poisoned"],
  goon: ["drunk"],
  organgrinder: ["drunk"],
  sailor: ["drunk"],
  innkeeper: ["drunk"],
  witch: ["cursed"],
};

/**
 * The phase after this one: setup → night 1 → day 1 → night 2 …; at dusk the Minstrel's token of yesterday goes
 * and so do the tokens of last night that last until dusk (UNTIL_DUSK), the Courtier's after its third day; at
 * dawn the Po's "3 attacks" once it attacked tonight and the Duchess's tokens of yesterday's visitors (they have
 * learned their number); at the dawn of day 3 the Minions become Riot.
 */
export function nextPhase(state: GrimoireState, characters: Record<string, GrimoireCharacter>): GrimoireState {
  const without = (gone: (r: GrimoireReminder) => boolean) =>
    state.seats.map((s) => (s.reminders.some(gone) ? { ...s, reminders: s.reminders.filter((r) => !gone(r)) } : s));
  if (state.phase === "setup" || state.phase === "day") {
    const dusk = state.phase === "day";
    const untilDusk = (r: GrimoireReminder) => !!r.roleId && !!UNTIL_DUSK[r.roleId]?.some((kind) => characters[r.roleId!]?.tokenKinds[r.text] === kind);
    // the Courtier's drunkenness lasts 3 nights and 3 days
    const courtier = (r: GrimoireReminder) => r.roleId === "courtier" && characters.courtier?.tokenKinds[r.text] === "drunk" && (r.round ?? 0) <= state.round - 2;
    const seats = without((r) => (r.roleId === MINSTREL && (r.round ?? 0) < state.round) || (dusk && (untilDusk(r) || courtier(r))));
    return { ...state, seats, phase: "night", round: state.round + 1, nightDone: [] };
  }
  if (state.phase === "night") {
    const po = characters.po;
    const attacked = remindersOf(state, "po").some(({ reminder }) => po?.tokenKinds[reminder.text] === "dead" && reminder.round === state.round);
    const spent = (r: GrimoireReminder) => attacked && r.roleId === "po" && po?.tokenKinds[r.text] === "charged" && (r.round ?? 0) < state.round;
    const visited = (r: GrimoireReminder) => r.roleId === "duchess" && (r.round ?? 0) < state.round;
    const day: GrimoireState = { ...state, seats: without((r) => spent(r) || visited(r)), phase: "day" };
    // on day 3 the Minions become Riot
    if (state.round !== 3 || !players(state).some((s) => s.role === "riot" && !s.dead)) return day;
    return players(state)
      .filter((s) => findRole(s.role)?.team === "minion")
      .reduce((x, minion) => changeRole(x, minion.id, "riot"), day);
  }
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

/** The Ferryman's final day: every dead player has their vote token again. */
export function returnVotes(state: GrimoireState): GrimoireState {
  return { ...state, seats: state.seats.map((s) => (s.dead && s.voteUsed ? { ...s, voteUsed: false } : s)) };
}

/**
 * A character's reminder token put on a player. A character has as many of a token as its reminders list
 * (mostly one), so when all are out the oldest is moved there: the Poisoner's poison goes to tonight's player,
 * the Shabaloth's two "Dead" of last night to tonight's two.
 */
export function placeReminder(state: GrimoireState, seatId: string, roleId: string, text: string, copies = 1): GrimoireState {
  const placed = state.seats.flatMap((s) =>
    s.reminders.filter((r) => r.roleId === roleId && r.text === text).map((r) => ({ seatId: s.id, id: r.id, round: r.round ?? 0 })),
  );
  // already there from an earlier night or day: put down again now (the Al-Hadikhia chose them again…)
  const here = placed.find((p) => p.seatId === seatId);
  if (here) {
    if (here.round === state.round) return state;
    const again = (s: GrimoireSeat) => ({ ...s, reminders: s.reminders.map((r) => (r.id === here.id ? { ...r, round: state.round } : r)) });
    return { ...state, seats: state.seats.map((s) => (s.id === seatId ? again(s) : s)) };
  }
  const moved = new Set(
    [...placed]
      .sort((a, b) => a.round - b.round)
      .slice(0, Math.max(0, placed.length + 1 - Math.max(1, copies)))
      .map((p) => p.id),
  );
  return {
    ...state,
    seats: state.seats.map((s) => {
      let reminders = s.reminders.some((r) => moved.has(r.id)) ? s.reminders.filter((r) => !moved.has(r.id)) : s.reminders;
      if (s.id === seatId) reminders = [...reminders, { id: uid(), roleId, text, round: state.round }].slice(0, MAX_REMINDERS);
      return reminders === s.reminders ? s : { ...s, reminders };
    }),
  };
}

/** A character's reminder tokens in the town, with the players they lie at. */
export function remindersOf(state: Pick<GrimoireState, "seats">, roleId: string) {
  return state.seats.flatMap((seat) => seat.reminders.filter((r) => r.roleId === roleId).map((reminder) => ({ seat, reminder })));
}

/**
 * Characters that might register to abilities as the other side and as a character of other teams, even if dead:
 * the Spy as good and a Townsfolk or Outsider, the Recluse as evil and a Minion or Demon.
 */
const MISREGISTERING: Record<string, RoleTeam[]> = { spy: ["townsfolk", "outsider"], recluse: ["minion", "demon"] };

/**
 * The Spy or Recluse whose ability the player has and that works (alive or dead, neither drunk nor poisoned):
 * the character and the teams they may register as (a Hermit as the Recluse of the script); null for everyone
 * else. They may register differently for every piece of information, each pair of the Chef's, each neighbour of
 * the Empath's.
 */
export function misregistration(
  state: Pick<GrimoireState, "seats"> & Partial<Pick<GrimoireState, "script">>,
  seat: GrimoireSeat,
  characters: Record<string, GrimoireCharacter>,
) {
  const roleId = Object.keys(MISREGISTERING).find((id) => hasAbility(seat, id) || hermitHas(state, seat, id));
  if (!roleId || impairment(state, seat, characters)) return null;
  return { roleId, teams: MISREGISTERING[roleId] };
}

/** Evil to an ability: for sure, maybe (a Spy or Recluse, see misregistration) or not (null). */
function registersEvil(state: Pick<GrimoireState, "seats">, seat: GrimoireSeat, characters: Record<string, GrimoireCharacter>): "evil" | "maybe" | null {
  if (misregistration(state, seat, characters)) return "maybe";
  return seatSide(seat, characters, state) === "evil" ? "evil" : null;
}

/**
 * A number an ability learns: as the characters are (`n`), every number it may be as a Spy or Recluse registers
 * one way or the other each time (`values`, `n` among them), and those players (`by`).
 */
export type InfoNumber = { n: number; values: number[]; by: GrimoireSeat[] };

function infoNumber(n: number, sure: number, maybe: number, by: GrimoireSeat[]): InfoNumber {
  return { n, values: Array.from({ length: maybe + 1 }, (_, k) => sure + k), by: [...new Set(by)] };
}

/** Pairs of evil players sitting next to each other: the Chef's number; a pair with a Spy or Recluse may count or not. */
export function evilPairs(state: Pick<GrimoireState, "seats">, characters: Record<string, GrimoireCharacter>): InfoNumber {
  const ring = players(state);
  if (ring.length < 3) return infoNumber(0, 0, 0, []);
  let n = 0;
  let sure = 0;
  const maybe: GrimoireSeat[][] = [];
  ring.forEach((s, i) => {
    const pair = [s, ring[(i + 1) % ring.length]];
    if (pair.every((p) => seatSide(p, characters, state) === "evil")) n++;
    const evil = pair.map((p) => registersEvil(state, p, characters));
    if (evil.every((e) => e === "evil")) sure++;
    else if (evil.every(Boolean)) maybe.push(pair.filter((_, k) => evil[k] === "maybe"));
  });
  return infoNumber(n, sure, maybe.length, maybe.flat());
}

/** A player's nearest living neighbours either way round the circle (one when they are the same player). */
export function livingNeighbours(state: Pick<GrimoireState, "seats">, seatId: string): GrimoireSeat[] {
  const ring = players(state);
  const i = ring.findIndex((s) => s.id === seatId);
  if (i < 0) return [];
  const nearest = (step: number) => {
    for (let k = 1; k < ring.length; k++) {
      const s = ring[(((i + step * k) % ring.length) + ring.length) % ring.length];
      if (!s.dead) return s;
    }
    return null;
  };
  return [...new Set([nearest(-1), nearest(1)])].filter((s): s is GrimoireSeat => !!s && s.id !== seatId);
}

/**
 * Every value a piece of information may have as each Spy or Recluse (misregistration) registers one way or the
 * other: `learn` works it out for one way they register (`as`: the team or side each of them registers as).
 */
function eachRegistering<T>(
  state: Pick<GrimoireState, "seats">,
  characters: Record<string, GrimoireCharacter>,
  learn: (as: (seat: GrimoireSeat) => RoleTeam | null) => T,
) {
  const seats = players(state).filter((s) => misregistration(state, s, characters));
  const options = (s: GrimoireSeat): (RoleTeam | null)[] => [findRole(s.role)?.team ?? null, ...misregistration(state, s, characters)!.teams];
  let combos: Map<string, RoleTeam | null>[] = [new Map()];
  for (const s of seats) combos = combos.flatMap((c) => options(s).map((team) => new Map([...c, [s.id, team]])));
  const values = new Set(combos.map((c) => learn((seat) => (c.has(seat.id) ? c.get(seat.id)! : (findRole(seat.role)?.team ?? null)))));
  return { values: [...values], by: seats };
}

/**
 * The Clockmaker's number: steps round the circle from the Demon to its nearest Minion (Legion counts as one too);
 * with a Spy or Recluse, every number it may be. 0 when there is no Demon or Minion.
 */
export function demonToMinion(state: Pick<GrimoireState, "seats">, characters: Record<string, GrimoireCharacter>): InfoNumber {
  const ring = players(state);
  const steps = (as: (seat: GrimoireSeat) => RoleTeam | null) => {
    const at = (team: RoleTeam) => ring.flatMap((s, i) => (as(s) === team || (team === "minion" && s.role === "legion") ? [i] : []));
    const distances = at("demon").flatMap((d) => at("minion").filter((m) => m !== d).map((m) => Math.min(Math.abs(d - m), ring.length - Math.abs(d - m))));
    return distances.length ? Math.min(...distances) : 0;
  };
  const { values, by } = eachRegistering(state, characters, steps);
  const n = steps((seat) => findRole(seat.role)?.team ?? null);
  return { n, values: values.sort((a, b) => a - b), by: values.length > 1 ? by : [] };
}

/**
 * The Shugenja's direction: whether the nearest evil player is clockwise (round the circle in its order), anti-
 * clockwise, or as far either way (then the Storyteller picks); with a Spy or Recluse, every answer it may be.
 */
export function nearestEvilWay(state: Pick<GrimoireState, "seats">, seatId: string, characters: Record<string, GrimoireCharacter>) {
  const ring = players(state);
  const i = ring.findIndex((s) => s.id === seatId);
  const way = (as: (seat: GrimoireSeat) => RoleTeam | null): "clockwise" | "anticlockwise" | "equal" => {
    const evil = (s: GrimoireSeat) => {
      const team = as(s);
      return team ? roleSide(team) === "evil" : false;
    };
    const distance = (step: number) => {
      for (let k = 1; k < ring.length; k++) if (evil(ring[(((i + step * k) % ring.length) + ring.length) % ring.length])) return k;
      return Infinity;
    };
    const [cw, acw] = [distance(1), distance(-1)];
    return cw < acw ? "clockwise" : acw < cw ? "anticlockwise" : "equal";
  };
  const { values, by } = eachRegistering(state, characters, way);
  return { n: way((seat) => findRole(seat.role)?.team ?? null), values, by: values.length > 1 ? by : [] };
}

/** Evil players among the dead: the Oracle's number; a dead Spy or Recluse may count or not. */
export function evilDead(state: Pick<GrimoireState, "seats">, characters: Record<string, GrimoireCharacter>): InfoNumber {
  const dead = players(state).filter((s) => s.dead);
  const evil = dead.map((s) => registersEvil(state, s, characters));
  const maybe = dead.filter((_, k) => evil[k] === "maybe");
  return infoNumber(dead.filter((s) => seatSide(s, characters, state) === "evil").length, evil.filter((e) => e === "evil").length, maybe.length, maybe);
}

/**
 * Every character a player may be shown as (the Undertaker's executee, the Ravenkeeper's choice): their own, and
 * a Spy's or Recluse's every one of the script's teams they may register as.
 */
export function shownAs(state: Pick<GrimoireState, "seats" | "script">, seat: GrimoireSeat, characters: Record<string, GrimoireCharacter>) {
  const teams = misregistration(state, seat, characters)?.teams ?? [];
  return [...new Set([seat.role, ...state.script.roleIds.filter((id) => teams.some((team) => findRole(id)?.team === team))].filter((id): id is string => !!id))];
}

/** Evil players among a player's nearest living neighbours: the Empath's number; a Spy or Recluse may count or not. */
export function evilLivingNeighbours(state: Pick<GrimoireState, "seats">, seatId: string, characters: Record<string, GrimoireCharacter>): InfoNumber {
  const both = livingNeighbours(state, seatId);
  const evil = both.map((s) => registersEvil(state, s, characters));
  const maybe = both.filter((_, k) => evil[k] === "maybe");
  return infoNumber(both.filter((s) => seatSide(s, characters, state) === "evil").length, evil.filter((e) => e === "evil").length, maybe.length, maybe);
}

/** The team whose character a Washerwoman, Librarian or Investigator learns. */
export const LEARNS_TEAM: Record<string, RoleTeam> = { washerwoman: "townsfolk", librarian: "outsider", investigator: "minion" };

/**
 * The characters a player may register as to an ability that learns a character of `team`: their own when it is
 * of that team (Legion is a Minion too), and every one of the script's of that team a Spy or Recluse may register
 * as. Empty when none fits.
 */
export function registersAs(
  state: Pick<GrimoireState, "seats" | "script">,
  seat: GrimoireSeat,
  team: RoleTeam,
  characters: Record<string, GrimoireCharacter>,
): string[] {
  const own = seat.role && (findRole(seat.role)?.team === team || (seat.role === "legion" && team === "minion")) ? [seat.role] : [];
  if (!misregistration(state, seat, characters)?.teams.includes(team)) return own;
  return [...new Set([...own, ...state.script.roleIds.filter((id) => findRole(id)?.team === team)])];
}

/** A character's token with this text taken away from the seat when it is there, else put there: a used ability, the Scarlet Woman's "Demon"… */
export function toggleReminder(state: GrimoireState, seatId: string, roleId: string | null, text: string): GrimoireState {
  return {
    ...state,
    seats: state.seats.map((s) => {
      if (s.id !== seatId) return s;
      const has = s.reminders.some((r) => r.roleId === roleId && r.text === text);
      const reminders = has
        ? s.reminders.filter((r) => !(r.roleId === roleId && r.text === text))
        : [...s.reminders, { id: uid(), roleId, text, round: state.round }].slice(0, MAX_REMINDERS);
      return { ...s, reminders };
    }),
  };
}

/** The token that marks a once-per-game ability used: the character's "No ability", else the grimoire's own (`own`); null when it has none. */
export function usedToken(c: GrimoireCharacter | undefined, own: string) {
  if (!c) return null;
  return Object.keys(c.tokenKinds).find((text) => c.tokenKinds[text] === "noAbility") ?? (c.once ? own : null);
}

/** Drunk or poisoned by the player's own character or a token on them. */
function ownImpairment(seat: Pick<GrimoireSeat, "role" | "reminders">, characters: Record<string, GrimoireCharacter>): "drunk" | "poisoned" | null {
  if (seat.role === "drunk") return "drunk";
  for (const r of seat.reminders) {
    const kind = r.roleId ? characters[r.roleId]?.tokenKinds[r.text] : undefined;
    if (kind === "poisoned" || kind === "drunk") return kind;
  }
  return null;
}

/** His token lies at the Minstrel while everyone else is drunk after a Minion's execution (setDead), until dusk tomorrow (nextPhase). */
const MINSTREL = "minstrel";

/**
 * Why a player's information may be false: they are the Drunk, lie under a token that makes them drunk or
 * poisoned, are the character the Philosopher took, a Minion at the Preacher's sermon (no ability), a Cannibal
 * who ate an evil executee, a Townsfolk the No Dashii poisons (noDashiiPoisoned) or on the Xaan's night and the
 * day after (xaanNight), or a living Minstrel's token says everyone else is drunk (travellers are not).
 */
export function impairment(
  state: Pick<GrimoireState, "seats"> & Partial<Pick<GrimoireState, "bag" | "round" | "phase" | "log">>,
  seat: GrimoireSeat,
  characters: Record<string, GrimoireCharacter>,
): "drunk" | "poisoned" | "minstrel" | "sermon" | null {
  const own = ownImpairment(seat, characters);
  if (own || isTraveller(seat.role)) return own;
  // the character the Philosopher took is drunk
  if (seat.role && players(state).some((s) => s.role === "philosopher" && s.believedRole === seat.role)) return "drunk";
  if (findRole(seat.role)?.team === "minion" && seat.reminders.some((r) => r.roleId === "preacher")) return "sermon";
  if (seat.role === "cannibal" && findRole(cannibalAte(state)?.role)?.team && roleSide(findRole(cannibalAte(state)!.role)!.team) === "evil") return "poisoned";
  const townsfolk = findRole(seat.role)?.team === "townsfolk";
  if (townsfolk && noDashiiPoisoned(state, characters).includes(seat.id)) return "poisoned";
  if (townsfolk && xaanNight(state, characters) === state.round && (state.phase === "night" || state.phase === "day")) return "poisoned";
  const minstrel = state.seats.some((s) => s.id !== seat.id && !s.dead && s.reminders.some((r) => r.roleId === MINSTREL) && !ownImpairment(s, characters));
  return minstrel ? "minstrel" : null;
}

/**
 * The Hermit has every Outsider ability of the script, but of the ones who think they are someone else (the
 * Drunk, the Lunatic…).
 */
export function hermitHas(state: Partial<Pick<GrimoireState, "script">>, seat: Pick<GrimoireSeat, "role">, roleId: string) {
  return seat.role === "hermit" && roleId !== "hermit" && findRole(roleId)?.team === "outsider" && linkedRoleOf(roleId)?.kind !== "as" && !!state.script?.roleIds.includes(roleId);
}

/** The player has the character's ability: they are it, or a Philosopher or Apprentice took it. */
function hasAbility(seat: GrimoireSeat, roleId: string) {
  return seat.role === roleId || (seat.believedRole === roleId && linkedRoleOf(seat.role)?.kind === "ability");
}

/** A living player has the character's ability, neither drunk nor poisoned: it works. */
export function abilityWorks(state: Pick<GrimoireState, "seats">, roleId: string, characters: Record<string, GrimoireCharacter>) {
  return players(state).some((s) => !s.dead && hasAbility(s, roleId) && !impairment(state, s, characters));
}

/**
 * The Townsfolk a living No Dashii poisons: the nearest one either way round the circle from it, alive or dead.
 * Nobody when the No Dashii is drunk or poisoned.
 */
export function noDashiiPoisoned(state: Pick<GrimoireState, "seats">, characters: Record<string, GrimoireCharacter>): string[] {
  const ring = players(state);
  return ring.flatMap((demon, i) => {
    if (demon.dead || demon.role !== "nodashii" || ownImpairment(demon, characters)) return [];
    const nearest = (step: number) => {
      for (let k = 1; k < ring.length; k++) {
        const s = ring[(((i + step * k) % ring.length) + ring.length) % ring.length];
        if (findRole(s.role)?.team === "townsfolk") return [s.id];
      }
      return [];
    };
    return [...new Set([...nearest(-1), ...nearest(1)])];
  });
}

/**
 * The Xaan's night X: as many as there are Outsiders in the game (the bag's, else the circle's); null without a
 * living Xaan whose ability works. On that night and the day after every Townsfolk is poisoned.
 */
export function xaanNight(state: Pick<GrimoireState, "seats"> & Partial<Pick<GrimoireState, "bag">>, characters: Record<string, GrimoireCharacter>) {
  const xaan = players(state).find((s) => s.role === "xaan" && !s.dead);
  if (!xaan || ownImpairment(xaan, characters)) return null;
  const roles = state.bag?.length ? state.bag : state.seats.map((s) => s.role);
  return teamCounts(roles).outsider;
}

/** A living Vortox, neither drunk nor poisoned: the Townsfolk's information is false, and a day without an execution evil wins. */
export function vortoxWorks(state: Pick<GrimoireState, "seats">, characters: Record<string, GrimoireCharacter>) {
  return abilityWorks(state, "vortox", characters);
}

/** A character's token of this kind, in the page's language. */
export function tokenOf(c: GrimoireCharacter | undefined, kind: TokenKind) {
  return c ? Object.keys(c.tokenKinds).find((text) => c.tokenKinds[text] === kind) : undefined;
}

/** The event put at the end of the game's log, as happening now: this night or day. */
function logged(state: GrimoireState, seat: GrimoireSeat, kind: GrimoireEvent["kind"], by?: string | null, fake?: boolean): GrimoireState {
  const event: GrimoireEvent = {
    round: state.round,
    ...(state.phase === "day" ? { day: true } : {}),
    kind,
    seatId: seat.id,
    name: seat.name,
    role: seat.role,
    ...(by ? { by } : {}),
    ...(fake ? { fake } : {}),
  };
  return { ...state, log: [...(state.log ?? []), event].slice(-MAX_EVENTS) };
}

/** The event happened in this very night or day. */
function isNow(state: Pick<GrimoireState, "round" | "phase">, e: GrimoireEvent) {
  return e.round === state.round && !!e.day === (state.phase === "day");
}

/** The Zombuul after their first death: dead in the town and to everyone, but alive – their last death only registered. */
export function registersDead(state: Pick<GrimoireState, "log">, seat: GrimoireSeat) {
  if (!seat.dead) return false;
  const last = (state.log ?? []).findLast((e) => e.seatId === seat.id && (e.kind === "death" || e.kind === "revived"));
  return last?.kind === "death" && !!last.fake;
}

/** Who died in this round: last night or today, or today and tonight (the Barber's and Hatter's "today or tonight"). */
export function diedLately(state: Pick<GrimoireState, "log" | "round" | "phase">) {
  const day = state.phase === "day";
  return (state.log ?? []).filter(
    (e) => e.kind === "death" && !e.fake && (e.round === state.round ? day || !e.day : !day && e.day && e.round === state.round - 1),
  );
}

/** Who died during the day before this night, a Zombuul only registering as dead too: the Zombuul's and Godfather's "today". */
export function diedToday(state: Pick<GrimoireState, "log" | "round">) {
  return (state.log ?? []).filter((e) => e.kind === "death" && e.day && e.round === state.round - 1);
}

function addReminder(state: GrimoireState, seatId: string, roleId: string, text: string | undefined): GrimoireState {
  if (!text) return state;
  return {
    ...state,
    seats: state.seats.map((s) =>
      s.id === seatId && !s.reminders.some((r) => r.roleId === roleId && r.text === text)
        ? { ...s, reminders: [...s.reminders, { id: uid(), roleId, text, round: state.round }].slice(0, MAX_REMINDERS) }
        : s,
    ),
  };
}

/** Characters whose own ability keeps their player alive when the Demon attacks; the Fool only the first time. */
const SAFE_FROM_DEMON = ["soldier", "sailor", "fool"];
/** Of the protections, the ones only from the Demon: the Monk's token, the Soldier; the others keep a player from dying at all. */
const DEMON_ONLY = new Set(["monk", "soldier"]);

/**
 * Who keeps a player alive when the Demon attacks them: the Monk, Innkeeper or Tea Lady with their token on them,
 * or the player's own Soldier, Sailor or Fool (the Fool's first death). Null = they die. Nothing protects when
 * its player is dead, drunk or poisoned. Not from the Demon (`fromDemon` false, the Godfather's kill), the
 * Monk and the Soldier do not protect.
 */
export function demonProtection(state: Pick<GrimoireState, "seats">, seatId: string, characters: Record<string, GrimoireCharacter>, fromDemon = true): string | null {
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat) return null;
  const protects = (id: string) => fromDemon || !DEMON_ONLY.has(id);
  const token = seat.reminders.find(
    (r) => r.roleId && protects(r.roleId) && characters[r.roleId]?.tokenKinds[r.text] === "protected" && abilityWorks(state, r.roleId, characters),
  );
  if (token?.roleId) return token.roleId;
  if (impairment(state, seat, characters)) return null;
  return SAFE_FROM_DEMON.find((id) => protects(id) && hasAbility(seat, id) && (id !== "fool" || !seat.reminders.some((r) => r.roleId === "fool"))) ?? null;
}

/** The player of the character the Storm Catcher named (its "Stormcaught"): they can only die by execution. */
export function stormcaught(state: Pick<GrimoireState, "fabled">, seat: Pick<GrimoireSeat, "reminders">, characters: Record<string, GrimoireCharacter>) {
  return hasFabled(state, "stormcatcher") && seat.reminders.some((r) => r.roleId === "stormcatcher" && characters.stormcatcher?.tokenKinds[r.text] === "stormcaught");
}

/**
 * Why a player does not die now though killed: the Storm Catcher's player at night, the Lleech while its host
 * lives, the Sailor, the Fool the first time, the Tea Lady's good neighbours, the Vizier by day, the player the
 * Devil's Advocate chose last night when executed today (a death by day counts as one); null = they die. Only
 * while that ability works.
 */
export function survives(state: GrimoireState, seat: GrimoireSeat, characters: Record<string, GrimoireCharacter>): string | null {
  if (state.phase !== "day" && stormcaught(state, seat, characters)) return "stormcatcher";
  const works = (id: string) => hasAbility(seat, id) && !impairment(state, seat, characters);
  const host = lleechHost(state, characters);
  if (works("lleech") && host && host.id !== seat.id && !host.dead) return "lleech";
  if (works("sailor")) return "sailor";
  if (works("fool") && !seat.reminders.some((r) => r.roleId === "fool")) return "fool";
  if (teaLadySafe(state, characters).includes(seat.id)) return "tealady";
  if (state.phase !== "day") return null;
  if (works("vizier")) return "vizier";
  const chosen = seat.reminders.some((r) => r.roleId === "devilsadvocate" && r.round === state.round);
  return chosen && abilityWorks(state, "devilsadvocate", characters) ? "devilsadvocate" : null;
}

/** The Tea Lady's nearest living neighbours when both are good: they cannot die, while her ability works. */
export function teaLadySafe(state: GrimoireState, characters: Record<string, GrimoireCharacter>): string[] {
  return players(state).flatMap((lady) => {
    if (lady.dead || !hasAbility(lady, "tealady") || impairment(state, lady, characters)) return [];
    const both = livingNeighbours(state, lady.id);
    return both.length === 2 && both.every((s) => seatSide(s, characters, state) === "good") ? both.map((s) => s.id) : [];
  });
}

/**
 * Who becomes the Demon when the Demon (`seatId`, not dead yet) dies and leaves no living Demon: the Scarlet Woman
 * when her ability works (5 or more players alive, travellers not counted, and she is neither drunk nor poisoned);
 * when an Imp kills themself (`starPass`) and she does not, any living Minion – the Storyteller picks.
 */
export function demonHeirs(state: Pick<GrimoireState, "seats" | "log">, seatId: string, characters: Record<string, GrimoireCharacter>, starPass = false) {
  const alive = (s: GrimoireSeat) => !s.dead || registersDead(state, s);
  if (players(state).some((s) => s.id !== seatId && alive(s) && findRole(s.role)?.team === "demon")) return [];
  const minions = players(state).filter((s) => !s.dead && s.id !== seatId && findRole(s.role)?.team === "minion");
  const enough = playerSeats(state).filter(alive).length >= 5;
  const scarletWoman = enough ? minions.filter((s) => s.role === "scarletwoman" && !impairment(state, s, characters)) : [];
  return scarletWoman.length || !starPass ? scarletWoman : minions;
}

/** A player becomes the Demon: their character is the Demon's (logged); a Scarlet Woman gets her "Demon" token, to show why. */
export function becomeDemon(state: GrimoireState, seatId: string, demonId: string, characters: Record<string, GrimoireCharacter>): GrimoireState {
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat) return state;
  const marked = seat.role === "scarletwoman" ? addReminder(state, seatId, "scarletwoman", characters.scarletwoman?.selfTokens[0]) : state;
  return logged({ ...marked, seats: marked.seats.map((s) => (s.id === seatId ? { ...s, role: demonId, believedRole: null } : s)) }, seat, "became", demonId);
}

/**
 * A player gets another character during the game (the Kazali's Minions, Riot, a Pit-Hag…), logged as "became".
 * Changed again in the same night or day, the one event says where it ended; back where it started, it goes.
 * Before the game it is only the setup.
 */
export function changeRole(state: GrimoireState, seatId: string, roleId: string | null): GrimoireState {
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat || seat.role === roleId) return state;
  const changed = { ...state, seats: state.seats.map((s) => (s.id === seatId ? { ...s, role: roleId, believedRole: null } : s)) };
  if (state.phase !== "night" && state.phase !== "day") return changed;
  const log = state.log ?? [];
  const last = log.at(-1);
  if (last?.kind !== "became" || last.seatId !== seatId || !isNow(state, last)) return roleId ? logged(changed, seat, "became", roleId) : changed;
  const rest = log.slice(0, -1);
  return { ...changed, log: last.role === roleId || !roleId ? rest : [...rest, { ...last, by: roleId }] };
}

/**
 * A player dies (`by`: whose ability killed them; none = the Storyteller's hand), logged. The Zombuul's first death
 * only makes them register as dead, unless drunk or poisoned (registersDead); they die for real when they die
 * again, dead as they look. Who survives (the Lleech, the Vizier by day…) does not die, but the Assassin's kill
 * (`force`) gets through; the Lleech dies with its host. A Demon who dies passes to their heir (demonHeirs) when
 * there is just one. Drunk or poisoned, the Zombuul and Lleech just die.
 */
function die(state: GrimoireState, seatId: string, by: string | null, characters: Record<string, GrimoireCharacter>, starPass = false, force = false): GrimoireState {
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat || !isPlayer(seat) || (seat.dead && !registersDead(state, seat))) return state;
  const kept = force ? null : survives(state, seat, characters);
  if (kept === "fool") return addReminder(logged(state, seat, "survived", kept), seatId, "fool", usedToken(characters.fool, "") ?? undefined);
  if (kept) return logged(state, seat, "survived", kept);
  const host = lleechHost(state, characters);
  const fake = !seat.dead && hasAbility(seat, "zombuul") && !impairment(state, seat, characters) && !(state.log ?? []).some((e) => e.seatId === seatId && e.fake);
  const heirs = !fake && findRole(seat.role)?.team === "demon" ? demonHeirs(state, seatId, characters, starPass) : [];
  const dead = { ...state, seats: state.seats.map((s) => (s.id === seatId ? { ...s, dead: true, voteUsed: s.dead && s.voteUsed } : s)) };
  const killed = logged(dead, seat, "death", by, fake);
  const next = heirs.length === 1 ? becomeDemon(killed, heirs[0].id, seat.role!, characters) : killed;
  // its host dead, the Lleech dies too
  const lleech = host?.id === seatId ? players(next).find((s) => s.id !== seatId && !s.dead && hasAbility(s, "lleech")) : undefined;
  return lleech ? die(next, lleech.id, "lleech", characters) : next;
}

/** The Cannibal's last meal: the player executed most recently (who died by day); their ability is the Cannibal's. */
export function cannibalAte(state: Partial<Pick<GrimoireState, "log">>) {
  return (state.log ?? []).findLast((e) => e.kind === "death" && e.day && !e.fake) ?? null;
}

/** The Lleech's host: the player its poison lies at. The Lleech dies if and only if they are dead. */
export function lleechHost(state: Pick<GrimoireState, "seats">, characters: Record<string, GrimoireCharacter>) {
  return remindersOf(state, "lleech").find(({ reminder }) => characters.lleech?.tokenKinds[reminder.text] === "poisoned")?.seat ?? null;
}

/**
 * A dead player back to life (`by`: whose ability; none = the Storyteller's hand). A death of this very night or
 * day the Storyteller takes back was a mistake: it goes from the log, and with it a Scarlet Woman's becoming the
 * Demon by it and the Lleech's death with its host; a Zombuul who died for real only registers as dead again.
 * Any other return is logged.
 */
function revive(state: GrimoireState, seatId: string, by: string | null, characters: Record<string, GrimoireCharacter>): GrimoireState {
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat?.dead) return state;
  const back = (dead: boolean) => state.seats.map((s) => (s.id === seatId ? { ...s, dead, voteUsed: dead && s.voteUsed } : s));
  const log = state.log ?? [];
  const i = log.findLastIndex((e) => e.seatId === seatId && e.kind === "death");
  if (by || i < 0 || !isNow(state, log[i])) return logged({ ...state, seats: back(false) }, seat, "revived", by);
  const after = log.slice(i + 1).filter((e) => isNow(state, e));
  const lleech = after.filter((e) => e.kind === "death" && e.by === "lleech");
  const demons = new Set([seat.role, ...lleech.map((e) => e.role)]);
  const heir = after.filter((e) => e.kind === "became" && e.role === "scarletwoman" && demons.has(e.by ?? null));
  const kept = log.filter((e, k) => k !== i && !heir.includes(e) && !lleech.includes(e));
  const token = characters.scarletwoman?.selfTokens[0];
  const seats = back(registersDead({ log: kept }, seat)).map((s) => {
    if (heir.some((e) => e.seatId === s.id)) {
      return { ...s, role: "scarletwoman", reminders: s.reminders.filter((r) => !(r.roleId === "scarletwoman" && r.text === token)) };
    }
    return lleech.some((e) => e.seatId === s.id) ? { ...s, dead: false } : s;
  });
  return { ...state, seats, log: kept };
}

/** A player's neighbours who are Townsfolk: whom a Minion the Vigormortis killed poisons. */
export function townsfolkNeighbours(state: Pick<GrimoireState, "seats">, seatId: string) {
  return [...new Set(neighbours(state, seatId))].filter((id) => findRole(state.seats.find((s) => s.id === id)?.role)?.team === "townsfolk");
}

/**
 * The Demon's "Dead" token put on a player at night is its attack: they die (die) unless demonProtection keeps
 * them alive (a Fool then uses up their ability), logged either way. An Imp who chose themself passes to a Minion
 * (demonHeirs). The Fang Gu's first Outsider becomes the Fang Gu (its "Once") and the Fang Gu dies instead, with
 * the token. A Minion the Vigormortis kills keeps their ability ("Has ability") and poisons their Townsfolk
 * neighbour; of two, the Storyteller picks. The Grandmother dies with her grandchild.
 */
export function demonAttack(state: GrimoireState, seatId: string, demonId: string, characters: Record<string, GrimoireCharacter>): GrimoireState {
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat || !isPlayer(seat) || seat.dead) return state;
  const by = demonProtection(state, seatId, characters);
  if (by) {
    const saved = logged(state, seat, "survived", by);
    return by === "fool" ? addReminder(saved, seatId, "fool", usedToken(characters.fool, "") ?? undefined) : saved;
  }
  if (demonId === "fanggu" && findRole(seat.role)?.team === "outsider") {
    const jumped = remindersOf(state, "fanggu").some(({ reminder }) => characters.fanggu?.tokenKinds[reminder.text] === "once");
    const fangGu = players(state).find((s) => s.id !== seatId && !s.dead && s.role === "fanggu");
    if (!jumped && fangGu) {
      let next = addReminder(becomeDemon(state, seatId, "fanggu", characters), seatId, "fanggu", tokenOf(characters.fanggu, "once"));
      const dead = tokenOf(characters.fanggu, "dead");
      if (dead) next = placeReminder(next, fangGu.id, "fanggu", dead);
      return die(next, fangGu.id, "fanggu", characters);
    }
  }
  const attacked = die(state, seatId, demonId, characters, demonId === "imp" && seat.role === "imp");
  // the Grandmother dies with her grandchild
  const grandchild = attacked.seats.find((s) => s.id === seatId)?.dead && seat.reminders.some((r) => r.roleId === "grandmother");
  const grandmother = grandchild ? players(attacked).find((s) => !s.dead && hasAbility(s, "grandmother") && !impairment(attacked, s, characters)) : undefined;
  const killed = grandmother ? die(attacked, grandmother.id, "grandmother", characters) : attacked;
  if (demonId !== "vigormortis" || findRole(seat.role)?.team !== "minion" || killed === state) return killed;
  const kept = addReminder(killed, seatId, "vigormortis", tokenOf(characters.vigormortis, "hasAbility"));
  const townsfolk = townsfolkNeighbours(kept, seatId);
  const poison = tokenOf(characters.vigormortis, "poisoned");
  if (townsfolk.length !== 1 || !poison) return kept;
  return placeReminder(kept, townsfolk[0], "vigormortis", poison, tokenCopies(kept, "vigormortis", poison, characters));
}

/**
 * A player the Al-Hadikhia chose chooses to live: a dead one comes back. When all three chose life tonight,
 * all three die (by its attack).
 */
function choseLife(state: GrimoireState, seatId: string, roleId: string, characters: Record<string, GrimoireCharacter>): GrimoireState {
  const back = state.seats.find((s) => s.id === seatId)?.dead ? revive(state, seatId, roleId, characters) : state;
  const life = remindersOf(back, roleId).filter(({ reminder }) => characters[roleId]?.tokenKinds[reminder.text] === "choseLife" && reminder.round === state.round);
  return life.length < 3 ? back : life.reduce((x, { seat }) => demonAttack(x, seat.id, roleId, characters), back);
}

/** Characters whose "Dead" kills only a good player: the Moonchild's choice, the Lycanthrope's. */
const KILLS_GOOD = new Set(["moonchild", "lycanthrope"]);

/**
 * The "Dead" of a character who is no Demon at night (the Godfather's kill, the Gossip's, the Moonchild's, the
 * Tinker's or Gambler's own death…): stopped by what keeps a player from dying at all (the Innkeeper, the Tea
 * Lady, the Sailor, the Fool) but not by the Monk's or Soldier's safety from the Demon; the Moonchild's and
 * Lycanthrope's only kill a good player; the Assassin's gets through everything.
 */
function abilityKill(state: GrimoireState, seatId: string, roleId: string, characters: Record<string, GrimoireCharacter>): GrimoireState {
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat || !isPlayer(seat) || seat.dead) return state;
  if (roleId === "assassin") return die(state, seatId, roleId, characters, false, true);
  if (KILLS_GOOD.has(roleId) && seatSide(seat, characters, state) === "evil") return state;
  const by = demonProtection(state, seatId, characters, false);
  if (!by) return die(state, seatId, roleId, characters);
  const saved = logged(state, seat, "survived", by);
  return by === "fool" ? addReminder(saved, seatId, "fool", usedToken(characters.fool, "") ?? undefined) : saved;
}

/** The seats that wake for a character: who is it, or thinks they are it, or took its ability. */
function wakesAs(seat: GrimoireSeat, roleId: string) {
  const kind = linkedRoleOf(seat.role)?.kind;
  return seat.role === roleId || (seat.believedRole === roleId && (kind === "as" || kind === "ability"));
}

/**
 * The living Goon chosen with a character's token for the first time tonight: the chooser is drunk until dusk
 * (the Goon's "Drunk" on them) and their choice does nothing, so their token is not put down; the Goon takes
 * their alignment. Null when it is no such choice.
 */
function goonChose(state: GrimoireState, seatId: string, roleId: string, characters: Record<string, GrimoireCharacter>) {
  const goon = state.seats.find((s) => s.id === seatId);
  const drunk = tokenOf(characters.goon, "drunk");
  if (state.phase !== "night" || !goon || goon.dead || roleId === "goon" || !drunk || !hasAbility(goon, "goon") || impairment(state, goon, characters)) return null;
  if (remindersOf(state, "goon").some(({ reminder }) => reminder.round === state.round)) return null;
  const chooser = players(state).filter((s) => s.id !== seatId && wakesAs(s, roleId));
  if (chooser.length !== 1) return null;
  return placeReminder(state, chooser[0].id, "goon", drunk);
}

/** The Po chose nobody last time: its "3 attacks" of an earlier night lies at it, tonight it chooses 3 players. */
export function poCharged(state: Pick<GrimoireState, "seats" | "round">, characters: Record<string, GrimoireCharacter>) {
  return remindersOf(state, "po").some(({ reminder }) => characters.po?.tokenKinds[reminder.text] === "charged" && (reminder.round ?? 0) < state.round);
}

/**
 * How many of a character's token there are: as many as its reminders list, but the Shabaloth's two "Dead", the
 * Po's three when it chose nobody last time (poCharged), the Al-Hadikhia's three choices of each kind, a
 * Vigormortis poison for each Minion it killed, the Angel's protection of every new player and the Duchess's two
 * visitors besides the one with false information.
 */
function tokenCopies(state: Pick<GrimoireState, "seats" | "round">, roleId: string, text: string, characters: Record<string, GrimoireCharacter>) {
  const c = characters[roleId];
  const kind = c?.tokenKinds[text];
  if (roleId === "shabaloth" && kind === "dead") return 2;
  if (roleId === "alhadikhia" && (kind === "choseDeath" || kind === "choseLife")) return 3;
  if (roleId === "po" && kind === "dead") return poCharged(state, characters) ? 3 : 1;
  // the Angel's first token, "Protect"
  if (roleId === "angel" && text === c?.reminders[0]) return MAX_SEATS;
  if (roleId === "duchess" && kind === "visitor") return 2;
  if (roleId === "vigormortis" && kind === "poisoned") {
    return Math.max(1, remindersOf(state, roleId).filter(({ reminder }) => c?.tokenKinds[reminder.text] === "hasAbility").length);
  }
  return c?.reminders.filter((x) => x === text).length || 1;
}

/**
 * A night step's token put on a player (placeReminder). At night the Demon's "Dead" is its attack (demonAttack);
 * the Pukka's poison moved on to tonight's player kills the one poisoned before (with the Pukka's "Dead"), not
 * one it lay at only since earlier tonight (a tap on the wrong player). A "Dead" moved on from a player who lived
 * through it tonight takes their "survived" out of the log: the Demon chose someone else after all. The
 * Shabaloth's "Alive" brings a dead player back, the Professor's a dead Townsfolk, when their ability works.
 * A player the Al-Hadikhia chose who chooses death dies by its attack; see choseLife. The "Dead" of a character
 * who is no Demon kills too (abilityKill). A Goon chosen first tonight makes the chooser drunk instead (goonChose).
 * The Snake Charmer's poison on the Demon swaps their characters.
 */
export function putToken(state: GrimoireState, seatId: string, roleId: string, text: string, characters: Record<string, GrimoireCharacter>): GrimoireState {
  const c = characters[roleId];
  const next = placeReminder(state, seatId, roleId, text, tokenCopies(state, roleId, text, characters));
  if (state.phase !== "night" || next === state || !c) return next;
  if (c.tokenKinds[text] === "alive") {
    const seat = next.seats.find((s) => s.id === seatId);
    const back = seat?.dead && abilityWorks(state, roleId, characters) && (roleId !== "professor" || findRole(seat.role)?.team === "townsfolk");
    return back ? revive(next, seatId, roleId, characters) : next;
  }
  const goon = goonChose(state, seatId, roleId, characters);
  if (goon) return goon;
  // the Snake Charmer chose the Demon: they swap characters (and so alignments), the old Demon is poisoned
  const charmed = next.seats.find((s) => s.id === seatId);
  const charmer = players(state).find((s) => s.id !== seatId && s.role === "snakecharmer" && !s.dead && !impairment(state, s, characters));
  if (roleId === "snakecharmer" && c.tokenKinds[text] === "poisoned" && charmer && findRole(charmed?.role)?.team === "demon") {
    return changeRole(changeRole(next, charmer.id, charmed!.role), seatId, "snakecharmer");
  }
  if (findRole(roleId)?.team !== "demon") return c.tokenKinds[text] === "dead" ? abilityKill(next, seatId, roleId, characters) : next;
  if (c.tokenKinds[text] === "choseDeath") return demonAttack(next, seatId, roleId, characters);
  if (c.tokenKinds[text] === "choseLife") return choseLife(next, seatId, roleId, characters);
  if (c.tokenKinds[text] === "dead") {
    const attacked = demonAttack(next, seatId, roleId, characters);
    const kept = new Set(next.seats.flatMap((s) => s.reminders.map((r) => r.id)));
    const moved = remindersOf(state, roleId).filter(({ reminder }) => reminder.text === text && reminder.round === state.round && !kept.has(reminder.id));
    const chosenElse = (e: GrimoireEvent) => e.kind === "survived" && isNow(state, e) && moved.some(({ seat }) => seat.id === e.seatId);
    return moved.length ? { ...attacked, log: attacked.log?.filter((e) => !chosenElse(e)) } : attacked;
  }
  if (roleId !== "pukka" || c.tokenKinds[text] !== "poisoned") return next;
  const before = remindersOf(state, roleId).find(({ reminder }) => reminder.text === text);
  if (!before || before.seat.id === seatId || before.seat.dead || before.reminder.round === state.round) return next;
  const dead = tokenOf(c, "dead");
  return dead ? putToken(next, before.seat.id, roleId, dead, characters) : demonAttack(next, before.seat.id, roleId, characters);
}

/**
 * After the Imp killed themself tonight (its "Dead" token of this round at a dead Imp): the new Imp, or the
 * living Minions to pick one from when none is yet. Null when no Imp killed themself tonight.
 */
export function starPass(state: GrimoireState, characters: Record<string, GrimoireCharacter>) {
  const imp = characters.imp;
  const killed = players(state).some((s) => s.dead && s.role === "imp" && s.reminders.some((r) => r.roleId === "imp" && r.round === state.round && imp?.tokenKinds[r.text] === "dead"));
  if (!killed) return null;
  const heir = players(state).find((s) => !s.dead && s.role === "imp") ?? null;
  return { heir, choices: heir ? [] : players(state).filter((s) => !s.dead && findRole(s.role)?.team === "minion") };
}

/**
 * A player dies (die: the Zombuul only registering, the Demon passing to the Scarlet Woman) or comes back to life
 * (revive) by the Storyteller's hand. A player dying in the day is executed: a Minion with a Minstrel whose ability
 * works makes everyone else drunk until dusk tomorrow (his token, see impairment; back to life, the token goes
 * again), a good player with the Leviathan gets its "Good player executed".
 */
export function setDead(state: GrimoireState, seatId: string, dead: boolean, characters: Record<string, GrimoireCharacter>): GrimoireState {
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat) return state;
  let changed = dead ? die(state, seatId, null, characters) : revive(state, seatId, null, characters);
  // a good player dying by day while the Leviathan lives was executed: its token on them (take it away if not)
  const executed = tokenOf(characters.leviathan, "goodExecuted");
  if (dead && state.phase === "day" && seatSide(seat, characters, state) === "good" && players(state).some((s) => s.role === "leviathan" && !s.dead)) {
    changed = addReminder(changed, seatId, "leviathan", executed);
  }
  // taken back the same day, so is the execution
  const today = (r: GrimoireReminder) => r.roleId === "leviathan" && r.text === executed && r.round === state.round;
  if (!dead && state.phase === "day" && seat.reminders.some(today)) {
    changed = { ...changed, seats: changed.seats.map((s) => (s.id === seatId ? { ...s, reminders: s.reminders.filter((r) => !today(r)) } : s)) };
  }
  // a Minion who did not die (the Vizier…) was no execution for the Minstrel
  const died = !dead || !!changed.seats.find((s) => s.id === seatId)?.dead;
  if (changed === state || !died || state.phase !== "day" || findRole(seat.role)?.team !== "minion") return changed;
  const minstrel = dead ? players(state).find((s) => !s.dead && hasAbility(s, MINSTREL) && !impairment(state, s, characters)) : undefined;
  if (dead && !minstrel) return changed;
  // an execution starts the night and day of drunkenness again; back to life, today's goes
  const gone = (r: GrimoireReminder) => r.roleId === MINSTREL && (dead || r.round === state.round);
  const cleared = { ...changed, seats: changed.seats.map((s) => (s.reminders.some(gone) ? { ...s, reminders: s.reminders.filter((r) => !gone(r)) } : s)) };
  return minstrel ? addReminder(cleared, minstrel.id, MINSTREL, characters[MINSTREL]?.reminders[0]) : cleared;
}

/**
 * Good, evil or neither (a traveller, no character) – the colour of a seat; with the characters, a player the
 * Mezepheles turned is evil; with the town, the Ogre is on their friend's side.
 */
export function seatSide(
  seat: Pick<GrimoireSeat, "id" | "role" | "reminders">,
  characters?: Record<string, GrimoireCharacter>,
  state?: Pick<GrimoireState, "seats">,
): "good" | "evil" | null {
  // a good player who said the Mezepheles's word
  if (characters && seat.reminders.some((r) => r.roleId && characters[r.roleId]?.tokenKinds[r.text] === "turnsEvil")) return "evil";
  // the Ogre is on the side of the player they chose
  const friend = seat.role === "ogre" && state ? remindersOf(state, "ogre").find((x) => x.seat.id !== seat.id)?.seat : undefined;
  if (friend) return seatSide(friend, characters);
  const role = findRole(seat.role);
  return role ? roleSide(role.team) : null;
}
