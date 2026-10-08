import { findRole, linkedRoleOf, roleSide } from "@/lib/botc-roles";
import type { GrimoireCharacter } from "./characters";
import {
  demonToMinion,
  diedToday,
  evilDead,
  evilLivingNeighbours,
  evilPairs,
  impairment,
  LEARNS_TEAM,
  players,
  registersAs,
  remindersOf,
  seatSide,
  shownAs,
  vortoxWorks,
  type GrimoireSeat,
  type GrimoireState,
  type InfoNumber,
  type NightStep,
} from "./state";

/**
 * What the Storyteller shows a player on the tablet instead of the paper info tokens: lines of a heading (the
 * official info tokens: "You are", "This is the Demon"…), characters, players, a number, yes or no, a side or
 * a text. Not saved: it lives on the grimoire's page while it is shown.
 */
export const showTitles = [
  "youAre",
  "thisIsDemon",
  "yourMinions",
  "notInPlay",
  "oneOfThem",
  "thisPlayerIs",
  "selectedYou",
  "useAbility",
  "choosePlayer",
  "chooseCharacter",
] as const;
export type ShowTitle = (typeof showTitles)[number];

export type ShowLine = {
  title: ShowTitle | null;
  roles: string[];
  seatIds: string[];
  /** A number to show; null = one to set before showing it */
  number?: number | null;
  answer?: "yes" | "no" | null;
  side?: "good" | "evil";
  text?: string;
};

export type ShowCard = {
  /** The players it is for, so the Storyteller shows it to the right one */
  forSeatIds: string[];
  lines: ShowLine[];
  /** "You are" of this player: the card offers the next player's */
  youAre?: string;
};

const line = (title: ShowTitle | null, more: Partial<ShowLine> = {}): ShowLine => ({ title, roles: [], seatIds: [], ...more });

/** The seats in the circle's order, so the order shown gives nothing away. */
function inSeatOrder(state: Pick<GrimoireState, "seats">, seatIds: string[]) {
  const wanted = new Set(seatIds);
  return state.seats.filter((s) => wanted.has(s.id)).map((s) => s.id);
}

/**
 * "You are": the character the player thinks they are (a Drunk, Lunatic or Marionette their other one) and their
 * side as they know it – a player the Mezepheles turned is evil; the Ogre does not learn theirs.
 */
export function youAreCard(state: Pick<GrimoireState, "seats">, seat: GrimoireSeat, characters: Record<string, GrimoireCharacter>): ShowCard {
  const thinks = linkedRoleOf(seat.role)?.kind === "as" ? (seat.believedRole ?? seat.role) : seat.role;
  const team = findRole(thinks)?.team;
  const known = linkedRoleOf(seat.role)?.kind === "as" || seat.role === "ogre" ? null : seatSide(seat, characters, state);
  const side = known ?? (team ? roleSide(team) : null);
  return {
    forSeatIds: [seat.id],
    youAre: seat.id,
    lines: [line("youAre", { roles: thinks ? [thinks] : [], ...(side ? { side } : {}) })],
  };
}

/** The next player clockwise with a character, for "You are" round the table. */
export function nextPlayer(state: Pick<GrimoireState, "seats">, seatId: string) {
  const ring = players(state);
  const i = ring.findIndex((s) => s.id === seatId);
  if (i < 0) return null;
  return [...ring.slice(i + 1), ...ring.slice(0, i)].find((s) => s.role) ?? null;
}

/**
 * What a night step shows its players, as far as the town tells: the Minions their Demon and each other, the
 * Demon its Minions and bluffs (a working Magician among both, a working Poppy Grower keeps them apart), the
 * Washerwoman's, Librarian's and Investigator's character and two players, the Chef's and Empath's numbers…
 * One card for each player when each learns their own. Left empty what the Storyteller must choose (a Spy's
 * character, false information under the Vortox, the Fortune Teller's answer); null: nothing to show.
 */
export function stepCards(
  state: GrimoireState,
  step: NightStep,
  characters: Record<string, GrimoireCharacter>,
): { seatIds: string[]; card: ShowCard }[] {
  const woken = step.seatIds.flatMap((id) => state.seats.filter((s) => s.id === id));
  const one = (lines: ShowLine[], seatIds = step.seatIds) => [{ seatIds, card: { forSeatIds: seatIds, lines } }];
  const each = (lines: (seat: GrimoireSeat) => ShowLine[]) => woken.map((s) => ({ seatIds: [s.id], card: { forSeatIds: [s.id], lines: lines(s) } }));
  const ofTeam = (team: string) => players(state).filter((s) => findRole(s.role)?.team === team).map((s) => s.id);
  const working = (roleId: string) => players(state).find((s) => s.role === roleId && !s.dead && !impairment(state, s, characters));

  if (step.special === "minionInfo" || step.special === "demonInfo") {
    if (!woken.length) return [];
    const apart = !!working("poppygrower");
    const magician = working("magician")?.id;
    const demons = inSeatOrder(state, [...ofTeam("demon"), ...(magician ? [magician] : [])]);
    const minions = inSeatOrder(state, [...ofTeam("minion"), ...(magician ? [magician] : [])]);
    if (step.special === "minionInfo") return apart ? [] : one([line("thisIsDemon", { seatIds: demons }), line("yourMinions", { seatIds: minions })]);
    const bluffs = line("notInPlay", { roles: state.bluffs.filter((id): id is string => !!id) });
    return one(apart ? [bluffs] : [line("yourMinions", { seatIds: minions }), bluffs]);
  }
  const roleId = step.roleId;
  const c = roleId ? characters[roleId] : undefined;
  if (!roleId || !c || !woken.length) return [];
  const vortox = woken.some((s) => findRole(s.role)?.team === "townsfolk") && vortoxWorks(state, characters);
  const night = state.phase === "night";
  const number = (x: InfoNumber) => line(null, { number: vortox ? null : x.n });

  // Washerwoman, Librarian, Investigator: the character under the first token, both players
  const team = LEARNS_TEAM[roleId];
  if (team) {
    const placed = remindersOf(state, roleId);
    const right = placed.find(({ reminder }) => c.tokenKinds[reminder.text] !== "wrong");
    const wrong = placed.find(({ reminder }) => c.tokenKinds[reminder.text] === "wrong");
    if (!right || !wrong) return one([line("oneOfThem")]);
    const roles = vortox ? [] : registersAs(state, right.seat, team, characters);
    return one([line("oneOfThem", { roles: roles.length === 1 ? roles : [], seatIds: inSeatOrder(state, [right.seat.id, wrong.seat.id]) })]);
  }
  if (roleId === "chef") return one([number(evilPairs(state, characters))]);
  if (roleId === "clockmaker") return one([number(demonToMinion(state, characters))]);
  if (roleId === "oracle" && night) return one([number(evilDead(state, characters))]);
  if (roleId === "empath") return each((s) => [number(evilLivingNeighbours(state, s.id, characters))]);
  if (roleId === "fortuneteller" || roleId === "seamstress") return each(() => [line(null, { answer: null })]);
  if (roleId === "undertaker" && night) {
    const executed = diedToday(state).flatMap((e) => {
      const seat = state.seats.find((x) => x.id === e.seatId);
      return seat ? [{ seat, roles: vortox ? [] : shownAs(state, { ...seat, role: e.role }, characters) }] : [];
    });
    if (!executed.length) return [];
    return one(executed.map(({ seat, roles }) => line("thisPlayerIs", { seatIds: [seat.id], roles: roles.length === 1 ? roles : [] })));
  }
  if (roleId === "grandmother") {
    const grandchild = remindersOf(state, roleId).find(({ seat }) => seat.role !== "grandmother")?.seat;
    return one([line("thisPlayerIs", grandchild ? { seatIds: [grandchild.id], roles: grandchild.role ? [grandchild.role] : [] } : {})]);
  }
  // the Sage learns the Demon and one more player, whom the Storyteller adds
  if (roleId === "choirboy" || roleId === "sage") return one([line(roleId === "choirboy" ? "thisIsDemon" : null, { seatIds: inSeatOrder(state, ofTeam("demon")) })]);
  if (roleId === "ravenkeeper" || roleId === "dreamer") return one([line("thisPlayerIs")]);
  // the Pixie learns a Townsfolk in play: the one she thinks she may be
  if (roleId === "pixie") return each((s) => [line(null, { roles: s.believedRole ? [s.believedRole] : [] })]);
  return one([line(null)]);
}
