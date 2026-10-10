/*
 * Finding games of the club's collection by name: the lending desk's search (client) and the guess of which game an
 * unknown bar code is (server, from the names GameUPC gives the code). No imports, so both sides and the tests
 * share it.
 */

/** Lower case without diacritics, so "novak" finds "Novák". */
export function fold(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const WORD_GAP = /[\s:,.()–-]+/;

/** Whether every word typed starts a word of `text`: "jan nov" finds "Jana Nováková", "7 divů světa: duel" its game. */
export function matchesWords(text: string, query: string) {
  const words = fold(text).split(WORD_GAP);
  return fold(query)
    .split(WORD_GAP)
    .filter(Boolean)
    .every((q) => words.some((w) => w.startsWith(q)));
}

/** A name as compared: folded, without "(Czech edition)" and the like, letters and digits only. */
function key(name: string) {
  return fold(name)
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function trigrams(s: string) {
  const padded = `  ${s} `;
  const set = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) set.add(padded.slice(i, i + 3));
  return set;
}

/** How alike two names are, 0 to 1 (Dice coefficient of their letter triples): "Ark Nova" and "Archa Nova" ≈ 0.6. */
export function nameSimilarity(a: string, b: string) {
  const [x, y] = [key(a), key(b)];
  if (!x || !y) return 0;
  if (x === y) return 1;
  const [tx, ty] = [trigrams(x), trigrams(y)];
  let common = 0;
  for (const t of tx) if (ty.has(t)) common++;
  return (2 * common) / (tx.size + ty.size);
}

/** Below this, a name is not taken for a guess. */
const SIMILAR = 0.5;

/**
 * The games most like any of the names `guesses` (the likeliest first), at most `limit`: each game by the best fit
 * of its names (the name in the list and its other names).
 */
export function guessGames(guesses: string[], games: { id: number; names: string[] }[], limit = 3) {
  if (guesses.length === 0) return [];
  return games
    .map((g) => ({ id: g.id, score: Math.max(...g.names.flatMap((n) => guesses.map((q) => nameSimilarity(n, q)))) }))
    .filter((g) => g.score >= SIMILAR)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((g) => g.id);
}
