import type { GrimoireSeat, TownPoint } from "./state";

/**
 * Where the places are in the town: on a circle (an ellipse filling the room), or on a grid where the Storyteller
 * puts them. Points are fractions of the room the places' middles have (TownPoint), so a layout keeps its shape on
 * any screen; distances count the room's width to height (`aspect`) and are in the room's heights.
 */

/** The grid places snap to: its steps across and down the room */
export const GRID = { cols: 24, rows: 16 } as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The point of the grid nearest to `p`, inside the room. */
export function snap(p: TownPoint): TownPoint {
  return { x: Math.round(clamp01(p.x) * GRID.cols) / GRID.cols, y: Math.round(clamp01(p.y) * GRID.rows) / GRID.rows };
}

/** Where the circle starts: at the top, or so that the Storyteller's spot is at the bottom (the table as the Storyteller sees it) */
function firstAngle(n: number, storyteller: number) {
  return storyteller >= 0 ? Math.PI / 2 - (2 * Math.PI * storyteller) / n : -Math.PI / 2;
}

/** The place `i` of `n` on the circle, clockwise; `storyteller`: the index of the Storyteller's spot, -1 = none. */
export function circlePoint(i: number, n: number, storyteller: number): TownPoint {
  const angle = firstAngle(n, storyteller) + (2 * Math.PI * i) / Math.max(n, 1);
  return { x: 0.5 + 0.5 * Math.cos(angle), y: 0.5 + 0.5 * Math.sin(angle) };
}

/** The index of the place on the circle nearest to `p`. */
export function nearestCirclePlace(p: TownPoint, n: number, storyteller: number) {
  const angle = Math.atan2(2 * p.y - 1, 2 * p.x - 1);
  const step = (2 * Math.PI) / Math.max(n, 1);
  return ((Math.round((angle - firstAngle(n, storyteller)) / step) % n) + n) % n;
}

function distance(aspect: number) {
  return (a: TownPoint, b: TownPoint) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

/**
 * Where the places show on the grid: where they were put. While no place has been put anywhere (right after the
 * switch from the circle) they show where they are on the circle; a place added since shows at the free point of
 * the grid nearest to the middle between its neighbours in the circle. `room`: how wide a token is.
 */
export function gridPoints(seats: Pick<GrimoireSeat, "gap" | "pos">[], aspect: number, room: number): TownPoint[] {
  const n = seats.length;
  const storyteller = seats.findIndex((s) => s.gap === "storyteller");
  if (!seats.some((s) => s.pos)) return seats.map((_, i) => circlePoint(i, n, storyteller));
  const d = distance(aspect);
  const points = seats.map((s) => s.pos);
  const nearest = (i: number, dir: number) => {
    for (let k = 1; k < n; k++) {
      const p = points[(i + dir * k + n) % n];
      if (p) return p;
    }
    return { x: 0.5, y: 0.5 };
  };
  for (let i = 0; i < n; i++) {
    if (points[i]) continue;
    const [a, b] = [nearest(i, -1), nearest(i, 1)];
    const target = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let best = target;
    let least = Infinity;
    for (let c = 0; c <= GRID.cols; c++) {
      for (let r = 0; r <= GRID.rows; r++) {
        const q = { x: c / GRID.cols, y: r / GRID.rows };
        const dq = d(q, target);
        if (dq < least && points.every((p) => !p || d(p, q) >= room)) [best, least] = [q, dq];
      }
    }
    points[i] = best;
  }
  return points as TownPoint[];
}

/**
 * The circle with the place at `from` put between the two neighbours it lies nearest to at `at`: the pair it is
 * the least detour from. It stays where it is when that is as near, and the others keep their order. With three
 * places or fewer each one neighbours all the others.
 */
export function insertNearest<T>(seats: T[], from: number, at: TownPoint, pointOf: (seat: T) => TownPoint, aspect: number): T[] {
  const n = seats.length;
  if (n < 4 || from < 0 || from >= n) return seats;
  const d = distance(aspect);
  const rest = seats.filter((_, i) => i !== from);
  const m = n - 1;
  // between rest[k - 1] and rest[k]
  const detour = (k: number) => {
    const a = pointOf(rest[(k + m - 1) % m]);
    const b = pointOf(rest[k]);
    return d(a, at) + d(at, b) - d(a, b);
  };
  // the place sits before rest[from]; the last one before rest[0], after the last of the rest
  const own = from === m ? 0 : from;
  let best = own;
  let least = detour(own);
  for (let k = 0; k < m; k++) {
    const x = detour(k);
    if (x < least - 1e-9) [best, least] = [k, x];
  }
  if (best === own) return seats;
  // before the first one is after the last one: the circle keeps its first place
  return best === 0 ? [...rest, seats[from]] : [...rest.slice(0, best), seats[from], ...rest.slice(best)];
}

const round = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * The places after the one with `id` was put down at `at` on the grid: the others stay where they show (`shown`,
 * by id, so a place never put anywhere stays put from now on), the moved one goes into the circle between the
 * neighbours it lies nearest to (insertNearest). The same places when nothing changes.
 */
export function putPlace(seats: GrimoireSeat[], id: string, at: TownPoint, shown: Record<string, TownPoint>, aspect: number): GrimoireSeat[] {
  let changed = false;
  const placed = seats.map((s) => {
    const p = s.id === id ? at : (s.pos ?? shown[s.id]);
    if (!p || (s.pos && s.pos.x === round(p.x) && s.pos.y === round(p.y))) return s;
    changed = true;
    return { ...s, pos: { x: round(p.x), y: round(p.y) } };
  });
  const center = { x: 0.5, y: 0.5 };
  const moved = insertNearest(placed, placed.findIndex((s) => s.id === id), at, (s) => s.pos ?? center, aspect);
  return changed || moved !== placed ? moved : seats;
}
