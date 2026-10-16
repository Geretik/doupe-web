/**
 * Deterministický PRNG nezávislý na platformě.
 * Seed (řetězec) -> 128-bitový hash (cyrb128) -> sfc32.
 * Stejný seed dá stejnou sekvenci v Node i v prohlížeči.
 */

export interface Rng {
  /** Rovnoměrné celé číslo v intervalu [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  /** Float v [0, 1). */
  next(): number;
}

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

export function createRng(seed: string): Rng {
  let [a, b, c, d] = cyrb128(seed);

  const nextU32 = (): number => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };

  // Zahřátí – rozprostře slabé seedy.
  for (let i = 0; i < 12; i++) nextU32();

  return {
    next: () => nextU32() / 4294967296,
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new RangeError(`nextInt: maxExclusive musí být kladné celé číslo, dostal ${maxExclusive}`);
      }
      // Rejection sampling – bez modulo biasu.
      const limit = 4294967296 - (4294967296 % maxExclusive);
      let r: number;
      do r = nextU32(); while (r >= limit);
      return r % maxExclusive;
    },
  };
}

/** Fisher–Yates (Durstenfeld) shuffle in-place. Vrací totéž pole. */
export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/** Náhodný seed pro případ, že volající žádný nezadal. */
export function randomSeed(prefix = "board"): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${hex}`;
}
