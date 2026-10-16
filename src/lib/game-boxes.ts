/*
 * Bundles of the club's games (admin → Půjčovna): a game packed in the box of another (an expansion built into the
 * base game) goes with it – a code of any game of the bundle finds it, and the bundle is lent and returned together.
 * No imports, so the page (server) and the desk (client) share it.
 */

/** Where each game packed in another lives: game id → the id of the game whose box it is */
export type PackedIn = Record<number, number>;

/** The game whose box `id` lives in: itself unless packed in another. */
export function boxOf(id: number, packedIn: PackedIn) {
  return packedIn[id] ?? id;
}

/** The games of `id`'s bundle: the box's own game first, then the games packed in it; just `id` when alone. */
export function bundleOf(id: number, packedIn: PackedIn): number[] {
  const box = boxOf(id, packedIn);
  return [box, ...Object.keys(packedIn).map(Number).filter((g) => packedIn[g] === box)];
}

/** The boxes found by a code: a code of any game of a bundle finds its box. */
export function boxesWithCode(codes: { gameId: number }[], packedIn: PackedIn) {
  return new Set(codes.map((c) => boxOf(c.gameId, packedIn)));
}
