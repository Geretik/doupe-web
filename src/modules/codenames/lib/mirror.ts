/**
 * Zrcadlové režimy (Mirrors): agenti každého týmu tvoří vzor souměrný podle jedné osy.
 *
 * Pravidla podle https://codenames.miraheze.org/wiki/Mirror_VIP_Mode :
 * - každý tým má právě jednu osu souměrnosti (žádná množina agentů není souměrná podle dvou os),
 * - osy týmů mohou být stejné i různé,
 * - volitelně: oba týmy mají na své ose stejný počet agentů,
 * - všechna platná rozložení jsou stejně pravděpodobná.
 * Civilisté a vrazi žádné omezení nemají.
 */
import type { MirrorAxis, MirrorRule } from "./types";
import type { Rng } from "./rng";

export const MIRROR_AXES: readonly MirrorAxis[] = ["VERTICAL", "HORIZONTAL", "DIAGONAL", "ANTI_DIAGONAL"];

export function isDiagonalAxis(axis: MirrorAxis): boolean {
  return axis === "DIAGONAL" || axis === "ANTI_DIAGONAL";
}

/** Obraz pole (x, y) v osové souměrnosti. */
export function mirrorPoint(axis: MirrorAxis, x: number, y: number, width: number, height: number): [number, number] {
  switch (axis) {
    case "VERTICAL":
      return [width - 1 - x, y];
    case "HORIZONTAL":
      return [x, height - 1 - y];
    case "DIAGONAL":
      return [y, x];
    case "ANTI_DIAGONAL":
      return [width - 1 - y, height - 1 - x];
  }
}

/** Rozklad plochy podle osy: pole ležící přímo na ose a dvojice navzájem souměrných polí. Indexy = y * width + x. */
export interface AxisOrbits {
  axis: MirrorAxis;
  fixed: number[];
  pairs: Array<[number, number]>;
}

export function axisOrbits(axis: MirrorAxis, width: number, height: number): AxisOrbits {
  const fixed: number[] = [];
  const pairs: Array<[number, number]> = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [mx, my] = mirrorPoint(axis, x, y, width, height);
      const i = y * width + x;
      const j = my * width + mx;
      if (i === j) fixed.push(i);
      else if (i < j) pairs.push([i, j]);
    }
  }
  return { axis, fixed, pairs };
}

/** Je množina polí souměrná podle osy? */
export function isSymmetric(cells: ReadonlySet<number>, axis: MirrorAxis, width: number, height: number): boolean {
  for (const i of cells) {
    const [mx, my] = mirrorPoint(axis, i % width, Math.floor(i / width), width, height);
    if (!cells.has(my * width + mx)) return false;
  }
  return true;
}

/** Podle kterých z daných os je množina souměrná. */
export function symmetryAxes(
  cells: ReadonlySet<number>,
  axes: readonly MirrorAxis[],
  width: number,
  height: number,
): MirrorAxis[] {
  return axes.filter((a) => isSymmetric(cells, a, width, height));
}

/** Kolik polí množiny leží přímo na ose. */
export function countOnAxis(cells: ReadonlySet<number>, axis: MirrorAxis, width: number, height: number): number {
  let n = 0;
  for (const i of cells) {
    const [mx, my] = mirrorPoint(axis, i % width, Math.floor(i / width), width, height);
    if (my * width + mx === i) n++;
  }
  return n;
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

interface FixedCountOption {
  /** Kolik agentů leží přímo na ose. */
  onAxis: number;
  /** Počet souměrných množin s tímto počtem agentů na ose. */
  weight: number;
}

/** Možnosti, jak složit `count` agentů z `fixed` polí na ose a `pairs` souměrných dvojic. */
function onAxisOptions(fixed: number, pairs: number, count: number): FixedCountOption[] {
  const out: FixedCountOption[] = [];
  for (let f = count % 2; f <= Math.min(fixed, count); f += 2) {
    const weight = binomial(fixed, f) * binomial(pairs, (count - f) / 2);
    if (weight > 0) out.push({ onAxis: f, weight });
  }
  return out;
}

function totalWeight(options: ReadonlyArray<{ weight: number }>): number {
  return options.reduce((s, o) => s + o.weight, 0);
}

function pickWeighted<T extends { weight: number }>(options: readonly T[], total: number, rng: Rng): T {
  let r = rng.next() * total;
  for (const o of options) {
    r -= o.weight;
    if (r < 0) return o;
  }
  return options[options.length - 1]!;
}

/** Rovnoměrný výběr k prvků (částečný Fisher–Yates nad kopií). */
function sample<T>(items: readonly T[], k: number, rng: Rng): T[] {
  const a = items.slice();
  for (let i = 0; i < k; i++) {
    const j = i + rng.nextInt(a.length - i);
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a.slice(0, k);
}

function pickSymmetricSet(fixed: readonly number[], pairs: ReadonlyArray<[number, number]>, onAxis: number, count: number, rng: Rng): number[] {
  return [...sample(fixed, onAxis, rng), ...sample(pairs, (count - onAxis) / 2, rng).flat()];
}

/**
 * Statická kontrola, zda zrcadlové pravidlo jde s danými počty vůbec splnit.
 * Vrací popis problému, nebo null.
 */
export function mirrorRuleProblem(
  rule: MirrorRule,
  width: number,
  height: number,
  primaryCount: number,
  secondaryCount: number,
): string | null {
  if (!Array.isArray(rule.axes) || rule.axes.length === 0) return "zrcadlový režim potřebuje aspoň jednu osu";
  for (const a of rule.axes) {
    if (!MIRROR_AXES.includes(a)) return `neznámá osa ${String(a)}`;
    if (isDiagonalAxis(a) && width !== height) return `osa ${a} je možná jen na čtvercové ploše`;
  }
  if (new Set(rule.axes).size !== rule.axes.length) return "osy se opakují";

  const feasible = (count: number) =>
    new Set(
      rule.axes.flatMap((a) => {
        const o = axisOrbits(a, width, height);
        return onAxisOptions(o.fixed.length, o.pairs.length, count).map((x) => x.onAxis);
      }),
    );
  const p = feasible(primaryCount);
  const s = feasible(secondaryCount);
  if (p.size === 0) return `${primaryCount} agentů nejde rozmístit souměrně podle zvolených os`;
  if (s.size === 0) return `${secondaryCount} agentů nejde rozmístit souměrně podle zvolených os`;
  if (rule.equalOnAxisCount && ![...p].some((f) => s.has(f))) {
    return "týmy nemohou mít na ose stejný počet agentů";
  }
  return null;
}

export interface MirrorLayout {
  primary: number[];
  secondary: number[];
  primaryAxis: MirrorAxis;
  secondaryAxis: MirrorAxis;
}

/** Strop pokusů; Ultimate Mirrors jich v průměru potřebuje desítky. */
const MAX_ATTEMPTS = 200_000;

/**
 * Rovnoměrně náhodné rozmístění agentů obou týmů podle zrcadlového pravidla.
 * Vrací null, pokud se platné rozložení nenašlo (prakticky jen u neřešitelné konfigurace).
 *
 * Rejection sampling, který zachovává rovnoměrnost přes všechna platná rozložení (P, S):
 * - Pro primární tým s osou a a k agenty na ose a pro osu b sekundárního týmu je B(a, k, b) horní
 *   mez počtu možností sekundárního týmu (pro b = a je přesná, pro b ≠ a hrubší).
 * 1. primární tým: (a, k) s vahou (počet souměrných množin) · Σ_b B(a, k, b), množina rovnoměrně,
 * 2. sekundární tým: osa b s vahou B(a, k, b), přijetí s pravděpodobností W / B, kde W je skutečný
 *    počet možností na volných polích; pak rovnoměrně jedna z nich.
 * Výsledná pravděpodobnost každého (P, S) je konstantní. Každé odmítnutí začíná znovu od bodu 1.
 */
export function generateMirrorLayout(
  width: number,
  height: number,
  primaryCount: number,
  secondaryCount: number,
  rule: MirrorRule,
  rng: Rng,
): MirrorLayout | null {
  const orbits = rule.axes.map((a) => axisOrbits(a, width, height));
  const freeCells = width * height - primaryCount;

  /** Počet souměrných množin sekundárního týmu z volných polí (volitelně s pevným počtem na ose). */
  const secondaryWeight = (freeFixed: number, freePairs: number, onAxis: number | null): number =>
    totalWeight(
      onAxisOptions(freeFixed, freePairs, secondaryCount).filter((o) => onAxis === null || o.onAxis === onAxis),
    );

  const bound = (primary: AxisOrbits, primaryOnAxis: number, secondary: AxisOrbits): number => {
    const onAxis = rule.equalOnAxisCount ? primaryOnAxis : null;
    if (secondary === primary) {
      // Stejná osa: primární tým zabírá přesně primaryOnAxis polí na ose a zbytek v celých dvojicích.
      const usedPairs = (primaryCount - primaryOnAxis) / 2;
      return secondaryWeight(primary.fixed.length - primaryOnAxis, primary.pairs.length - usedPairs, onAxis);
    }
    // Jiná osa: počet volných polí na ose a volných dvojic omezuje jen počet volných polí celkem.
    let best = 0;
    for (let ff = 0; ff <= secondary.fixed.length; ff++) {
      const fp = Math.min(secondary.pairs.length, Math.floor((freeCells - ff) / 2));
      if (fp >= 0) best = Math.max(best, secondaryWeight(ff, fp, onAxis));
    }
    return best;
  };

  const primaryOptions = orbits
    .flatMap((orbit) =>
      onAxisOptions(orbit.fixed.length, orbit.pairs.length, primaryCount).map((o) => {
        const secondary = orbits.map((s) => ({ orbit: s, weight: bound(orbit, o.onAxis, s) }));
        const secondaryTotal = totalWeight(secondary);
        return { orbit, onAxis: o.onAxis, secondary, secondaryTotal, weight: o.weight * secondaryTotal };
      }),
    )
    .filter((o) => o.weight > 0);
  const primaryTotal = totalWeight(primaryOptions);
  if (primaryTotal === 0) return null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const p = pickWeighted(primaryOptions, primaryTotal, rng);
    const primary = pickSymmetricSet(p.orbit.fixed, p.orbit.pairs, p.onAxis, primaryCount, rng);
    const primarySet = new Set(primary);
    if (symmetryAxes(primarySet, rule.axes, width, height).length !== 1) continue;

    const s = pickWeighted(p.secondary, p.secondaryTotal, rng);
    const freeFixed = s.orbit.fixed.filter((i) => !primarySet.has(i));
    const freePairs = s.orbit.pairs.filter(([a, b]) => !primarySet.has(a) && !primarySet.has(b));
    const options = onAxisOptions(freeFixed.length, freePairs.length, secondaryCount).filter(
      (o) => !rule.equalOnAxisCount || o.onAxis === p.onAxis,
    );
    const total = totalWeight(options);
    if (total === 0 || rng.next() * s.weight >= total) continue;

    const onAxis = pickWeighted(options, total, rng).onAxis;
    const secondary = pickSymmetricSet(freeFixed, freePairs, onAxis, secondaryCount, rng);
    if (symmetryAxes(new Set(secondary), rule.axes, width, height).length !== 1) continue;

    return { primary, secondary, primaryAxis: p.orbit.axis, secondaryAxis: s.orbit.axis };
  }
  return null;
}
