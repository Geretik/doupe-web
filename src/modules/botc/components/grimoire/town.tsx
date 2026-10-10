"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { linkedRoleOf } from "@/modules/botc/lib/botc-roles";
import {
  abilityWorks,
  diedLately,
  fiddleSeats,
  hasFabled,
  hermitHas,
  moveSeat,
  players,
  remindersOf,
  seatSide,
  tokenOf,
  voteMath,
  vortoxWorks,
  type GapKind,
  type GrimoireSeat,
  type GrimoireState,
  type TownPoint,
} from "@/modules/botc/lib/grimoire/state";
import { circlePoint, GRID, gridPoints, insertNearest, nearestCirclePlace, putPlace, snap } from "@/modules/botc/lib/grimoire/layout";
import { findRole } from "@/modules/botc/lib/botc-roles";
import type { GrimoireCharacter } from "@/modules/botc/lib/grimoire/characters";
import { fill } from "@/modules/botc/lib/grimoire/text";
import { nameOf, RoleIcon, useGrimoire, type GrimoireTexts } from "./context";

const LABEL = 22;
const PILL_W = 104;
const PILL_H = 26;
/** How far a finger goes on a place before it is a drag, not a tap */
const DRAG_START = 8;
/** Places glide to where they move: around the circle while one is dragged, the whole circle when it turns */
const glide = "transition-[left,top] duration-200 ease-out motion-reduce:transition-none";

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

const sideBorder = { good: "border-good", evil: "border-accent" } as const;

export const gapIcon: Record<GapKind, string> = { door: "🚪", storyteller: "🎩", obstacle: "🚧" };

/**
 * The town square: the circle on an ellipse filling the area, clockwise, each player with their reminder
 * tokens pointing to the middle; the phase and the vote count in the middle. The Storyteller's spot is at
 * the bottom, so the tablet shows the table as the Storyteller sees it (without one the first seat is at
 * the top). Sizes follow the area and the number of places, so it works on a tablet either way round and
 * on a phone. With `onMove`, a place is dragged to another one; the places in between make room.
 * Laid out on a grid (state.layout), the places are where the Storyteller put them (lib/grimoire/layout):
 * a place dragged snaps to the grid and goes into the circle between the two it lies nearest to; while
 * places can be moved, the grid's points and a line round the circle show.
 */
export function Town({
  selectedId,
  highlightIds,
  onSelect,
  onMove,
  center,
  hideRoles = false,
  onBackground,
  empty,
}: {
  selectedId: string | null;
  /** Seats that wake on the night step in focus */
  highlightIds: string[];
  onSelect: (seatId: string) => void;
  /** A place dragged: how the places change; absent = the places stay put */
  onMove?: (move: (seats: GrimoireSeat[]) => GrimoireSeat[]) => void;
  center: React.ReactNode;
  /** Characters face down, no reminders: the players hold the tablet (the draw), or someone helps with the hidden grimoire */
  hideRoles?: boolean;
  /** A tap on the square where there is no place, e.g. to let go of the selected player */
  onBackground?: () => void;
  /** What to do without any places; by default to add players in the setup */
  empty?: string;
}) {
  const { state, scale, t } = useGrimoire();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<{ id: string; from: number; to: number; x: number; y: number } | null>(null);
  /** Set by a drag, so the click that ends it does not open the place */
  const dragged = useRef(false);
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const seats = state.seats;
  const n = seats.length;
  const grid = state.layout === "grid";
  const { w, h } = size;
  // the names under the tokens; everything sized by the room, then by this device's scale
  const label = LABEL * scale;
  const radius = Math.min(w, h - label) / 2;
  const token = Math.min(clamp(((2 * Math.PI * radius) / Math.max(n, 1)) * 0.68, 44, 104) * scale, radius);
  const pill = clamp(token * 0.32, 20 * scale, PILL_H * scale);
  const pillW = PILL_W * scale;
  const cx = w / 2;
  const cy = (h - label) / 2;
  const rx = Math.max(0, w / 2 - token / 2 - 4);
  const ry = Math.max(0, (h - label) / 2 - token / 2 - 4);
  // a point of the room the places' middles have (lib/grimoire/layout) on the screen, and back
  const toScreen = (p: TownPoint) => ({ x: cx + rx * (2 * p.x - 1), y: cy + ry * (2 * p.y - 1) });
  const toPoint = (x: number, y: number): TownPoint => ({ x: rx ? (x - cx + rx) / (2 * rx) : 0.5, y: ry ? (y - cy + ry) / (2 * ry) : 0.5 });
  const aspect = ry ? rx / ry : 1;
  const room = ry ? token / (2 * ry) : 0;
  const storyteller = seats.findIndex((s) => s.gap === "storyteller");
  const onGrid = useMemo(() => (grid ? gridPoints(seats, aspect, room) : []), [grid, seats, aspect, room]);
  const shown = Object.fromEntries(onGrid.map((p, i) => [seats[i].id, p]));
  const pointOf = (seat: GrimoireSeat) => shown[seat.id];
  // while a place is dragged: the circle as it would be after the drop, the dragged one under the finger
  const order = !drag ? seats : grid ? insertNearest(seats, drag.from, toPoint(drag.x, drag.y), pointOf, aspect) : moveSeat(seats, drag.from, drag.to);
  const places = seats.map((seat, i) => {
    if (drag?.id === seat.id) return { seat, x: drag.x, y: drag.y };
    return { seat, ...toScreen(grid ? onGrid[i] : circlePoint(order.indexOf(seat), n, storyteller)) };
  });
  // the middle the reminders point to and the phase is in: the circle's, on the grid the middle of the places
  let middle = { left: cx - rx * 0.55, top: cy - ry * 0.45, width: rx * 1.1, height: ry * 0.9 };
  if (grid && n > 0) {
    const xs = onGrid.map((p) => toScreen(p).x);
    const ys = onGrid.map((p) => toScreen(p).y);
    const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const width = Math.min(w, Math.max(160, (right - left) * 0.55));
    const height = Math.min(h - label, Math.max(80, (bottom - top) * 0.45));
    middle = {
      left: clamp((left + right - width) / 2, 0, w - width),
      top: clamp((top + bottom - height) / 2, 0, h - label - height),
      width,
      height,
    };
  }
  const mx = middle.left + middle.width / 2;
  const my = middle.top + middle.height / 2;

  const press = (e: React.PointerEvent, seatId: string) => {
    if (!onMove || !e.isPrimary || e.button !== 0) return;
    stopDrag.current?.();
    dragged.current = false;
    const box = ref.current!.getBoundingClientRect();
    const { pointerId, clientX: startX, clientY: startY } = e;
    const from = seats.findIndex((s) => s.id === seatId);
    const start = places[from];
    let to = from;
    let at = grid ? shown[seatId] : null;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!dragged.current && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_START) return;
      dragged.current = true;
      if (grid) {
        // from where it was, as far as the finger went, on the nearest point of the grid
        at = snap(toPoint(start.x + ev.clientX - startX, start.y + ev.clientY - startY));
        setDrag({ id: seatId, from, to, ...toScreen(at) });
        return;
      }
      const x = ev.clientX - box.left;
      const y = ev.clientY - box.top;
      to = nearestCirclePlace(toPoint(x, y), n, storyteller);
      setDrag({ id: seatId, from, to, x, y });
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      stop();
      if (dragged.current && ev.type === "pointerup") {
        onMove(at ? (s) => putPlace(s, seatId, at!, shown, aspect) : (s) => moveSeat(s, from, to));
      }
      // the click of this press comes right after; a later one is a tap again
      setTimeout(() => (dragged.current = false));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      stopDrag.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    stopDrag.current = stop;
  };
  const select = (seatId: string) => !dragged.current && onSelect(seatId);
  const moving = (seatId: string) => ({
    dragging: drag?.id === seatId,
    onPointerDown: onMove ? (e: React.PointerEvent) => press(e, seatId) : undefined,
  });
  const where = Object.fromEntries(places.map((p) => [p.seat.id, p]));
  const cell = { x: (2 * rx) / GRID.cols, y: (2 * ry) / GRID.rows };

  return (
    <div ref={ref} className="absolute inset-0 select-none" data-testid="town" data-layout={grid ? "grid" : "circle"} onClick={(e) => e.target === e.currentTarget && onBackground?.()}>
      {w > 0 && (
        <>
          {grid && onMove && (
            <>
              <div
                className="pointer-events-none absolute text-muted/40"
                style={{
                  left: cx - rx - cell.x / 2,
                  top: cy - ry - cell.y / 2,
                  width: 2 * rx + cell.x,
                  height: 2 * ry + cell.y,
                  backgroundImage: "radial-gradient(circle, currentColor 1.5px, transparent 2px)",
                  backgroundSize: `${cell.x}px ${cell.y}px`,
                }}
                aria-hidden
                data-testid="town-grid"
              />
              {n > 2 && (
                // who neighbours whom: the order of the circle, which the places' spots do not show by themselves
                <svg className="pointer-events-none absolute inset-0 text-muted/50" width={w} height={h} aria-hidden>
                  <polygon
                    points={order.map((s) => `${where[s.id].x},${where[s.id].y}`).join(" ")}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeDasharray="6 6"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </>
          )}
          <div className="pointer-events-none absolute flex flex-col items-center justify-center gap-1 text-center" style={middle}>
            {center}
          </div>
          {places.map(({ seat, x, y }) => {
            if (seat.gap) {
              return (
                <Gap key={seat.id} gap={seat.gap} size={token} x={x} y={y} selected={seat.id === selectedId} onClick={() => select(seat.id)} {...moving(seat.id)} />
              );
            }
            const dx = mx - x;
            const dy = my - y;
            const len = Math.hypot(dx, dy);
            // a place in the very middle has them below
            const [ux, uy] = len < 1 ? [0, 1] : [dx / len, dy / len];
            // along the way to the middle; horizontal neighbours need a pill's width, vertical ones its height
            const step = Math.abs(ux) * (pillW + 6) + Math.abs(uy) * (pill + 6);
            const start = token / 2 + 6 + step / 2;
            return (
              <div key={seat.id}>
                {!hideRoles && drag?.id !== seat.id && seat.reminders.map((r, j) => {
                  const d = start + j * step;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => select(seat.id)}
                      className={`absolute flex items-center gap-1 rounded-full border border-border bg-card/95 px-1.5 leading-none shadow-sm ${glide}`}
                      style={{ left: x + ux * d - pillW / 2, top: y + uy * d - pill / 2, maxWidth: pillW, height: pill, fontSize: 11 * scale }}
                      title={r.text}
                      data-testid="reminder"
                    >
                      {r.roleId && <RoleIcon roleId={r.roleId} size={pill - 6} />}
                      <span className="truncate">{r.text}</span>
                    </button>
                  );
                })}
                <SeatToken
                  seat={seat}
                  size={token}
                  x={x}
                  y={y}
                  selected={seat.id === selectedId}
                  highlighted={highlightIds.includes(seat.id)}
                  onClick={() => select(seat.id)}
                  hidden={hideRoles}
                  {...moving(seat.id)}
                />
              </div>
            );
          })}
          {n === 0 && (
            // under the phase in the middle
            <p className="absolute inset-x-0 text-center text-muted" style={{ top: cy + 24 }}>
              {empty ?? t.noSeats}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** In the town's corner: the seating locked, and the circle or the grid; in the grimoire and in the setup's town alike. */
export function SeatingButtons() {
  const { state, update, readOnly, t } = useGrimoire();
  if (readOnly || state.seats.length < 2) return null;
  const grid = state.layout === "grid";
  return (
    <div className="absolute top-0 left-0 z-10 flex flex-col gap-2">
      {/* the seating done, the circle is locked so a finger in the game does not move anybody */}
      <button
        type="button"
        onClick={() => update((s) => ({ ...s, seatsLocked: !s.seatsLocked }))}
        className={`flex size-11 items-center justify-center rounded-full border bg-card text-lg shadow-sm ${state.seatsLocked ? "border-accent" : "border-border"}`}
        aria-pressed={!!state.seatsLocked}
        aria-label={state.seatsLocked ? t.unlockSeats : t.lockSeats}
        title={state.seatsLocked ? t.unlockSeats : t.lockSeats}
        data-testid="seats-lock"
      >
        {state.seatsLocked ? "🔒" : "🔓"}
      </button>
      {/* the circle, or the places where the Storyteller puts them, like the table they sit at; part of the seating */}
      {!state.seatsLocked && (
        <button
          type="button"
          onClick={() => update((s) => ({ ...s, layout: s.layout === "grid" ? "circle" : "grid" }))}
          className={`flex size-11 items-center justify-center rounded-full border bg-card shadow-sm ${grid ? "border-accent" : "border-border"}`}
          aria-pressed={grid}
          aria-label={grid ? t.layoutCircle : t.layoutGrid}
          title={grid ? t.layoutCircle : t.layoutGrid}
          data-testid="town-layout"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
            {grid
              ? [5, 12, 19].flatMap((x) => [5, 12, 19].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r={2.2} />))
              : Array.from({ length: 8 }, (_, i) => <circle key={i} cx={12 + 8 * Math.cos((i * Math.PI) / 4)} cy={12 + 8 * Math.sin((i * Math.PI) / 4)} r={2.2} />)}
          </svg>
        </button>
      )}
    </div>
  );
}

/** How a place is moved: none, gliding into its place, or dragged under the finger. */
type Moving = { dragging: boolean; onPointerDown?: (e: React.PointerEvent) => void };

function moveClass({ dragging, onPointerDown }: Moving) {
  if (dragging) return "z-20 scale-110 cursor-grabbing touch-none";
  return `${glide} ${onPointerDown ? "cursor-grab touch-none" : ""}`;
}

/** A gap in the circle: smaller and dashed, an icon and what it is. */
function Gap({
  gap,
  size,
  x,
  y,
  selected,
  onClick,
  ...moving
}: { gap: GapKind; size: number; x: number; y: number; selected: boolean; onClick: () => void } & Moving) {
  const { scale, t } = useGrimoire();
  const d = size * 0.62;
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={moving.onPointerDown}
      className={`absolute flex flex-col items-center ${moveClass(moving)}`}
      style={{ left: x - size / 2, top: y - d / 2, width: size }}
      aria-pressed={selected}
      data-testid="gap"
      data-gap={gap}
    >
      <span
        className={`flex items-center justify-center rounded-full border-2 border-dashed border-muted/60 bg-background/60 ${selected ? "outline-4 outline-offset-2 outline-accent" : ""}`}
        style={{ width: d, height: d, fontSize: d * 0.45 }}
      >
        {gapIcon[gap]}
      </span>
      <span className="mt-0.5 text-muted" style={{ fontSize: 12 * scale }}>
        {t.gaps[gap]}
      </span>
    </button>
  );
}

function SeatToken({
  seat,
  size,
  x,
  y,
  selected,
  highlighted,
  onClick,
  hidden,
  ...moving
}: {
  seat: GrimoireSeat;
  size: number;
  x: number;
  y: number;
  selected: boolean;
  highlighted: boolean;
  onClick: () => void;
  hidden: boolean;
} & Moving) {
  const { state, characters, scale, locale, t } = useGrimoire();
  const nameSize = { fontSize: 14 * scale };
  const ring = selected ? "outline-4 outline-offset-2 outline-accent" : highlighted ? "outline-4 outline-offset-2 outline-amber-400" : "";
  if (hidden) {
    // face down: whether the place has a character, never which; who died is no secret
    return (
      <button
        type="button"
        onClick={onClick}
        onPointerDown={moving.onPointerDown}
        className={`absolute flex flex-col items-center ${moveClass(moving)}`}
        style={{ left: x - size / 2, top: y - size / 2, width: size }}
        aria-pressed={selected}
        data-testid="seat"
        data-seat={seat.name}
        data-drawn={seat.role ? "yes" : "no"}
      >
        <span
          className={`relative flex items-center justify-center overflow-hidden rounded-full border-[3px] shadow-md ${seat.role ? "border-foreground/70 bg-foreground/80 text-background" : "border-dashed border-accent/60 bg-card text-accent"} ${ring}`}
          style={{ width: size, height: size, fontSize: size * 0.4 }}
        >
          {seat.role ? "✓" : "?"}
          {seat.dead && <span className="absolute inset-0 rounded-full bg-black/45" aria-hidden />}
        </span>
        {seat.dead && <DeadMarks seat={seat} />}
        <span className={`mt-0.5 max-w-[150%] truncate leading-tight font-semibold ${seat.dead ? "text-muted line-through" : ""}`} style={nameSize}>
          {seat.name || "\u00a0"}
        </span>
      </button>
    );
  }
  const side = seatSide(seat, characters, state);
  const border = side ? sideBorder[side] : seat.role ? "border-muted" : "border-dashed border-border";
  const linked = seat.believedRole && linkedRoleOf(seat.role) ? seat.believedRole : null;
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={moving.onPointerDown}
      className={`absolute flex flex-col items-center ${moveClass(moving)}`}
      style={{ left: x - size / 2, top: y - size / 2, width: size }}
      aria-pressed={selected}
      data-testid="seat"
      data-seat={seat.name}
    >
      <span
        className={`relative flex flex-col items-center justify-center overflow-hidden rounded-full border-[3px] bg-card shadow-md ${border} ${ring} ${highlighted && !selected ? "animate-pulse" : ""}`}
        style={{ width: size, height: size }}
      >
        {seat.role ? (
          <>
            <RoleIcon roleId={seat.role} size={size * 0.56} className={seat.dead ? "grayscale" : ""} />
            <span className="max-w-[88%] truncate leading-tight font-semibold" style={{ fontSize: clamp(size * 0.12, 9 * scale, 13 * scale) }}>
              {nameOf(seat.role, locale)}
            </span>
          </>
        ) : (
          <span className="text-muted" style={{ fontSize: 12 * scale }}>
            {t.noRole}
          </span>
        )}
        {seat.dead && <span className="absolute inset-0 rounded-full bg-black/45" aria-hidden />}
      </span>
      {seat.dead && <DeadMarks seat={seat} />}
      {linked && (
        <span className="absolute rounded-full border border-border bg-card p-0.5 shadow" style={{ left: -4, top: size * 0.62 }}>
          <RoleIcon roleId={linked} size={clamp(size * 0.3, 16, 28)} />
        </span>
      )}
      <span className={`mt-0.5 max-w-[150%] truncate leading-tight font-semibold ${seat.dead ? "text-muted line-through" : ""}`} style={nameSize}>
        {seat.name || "?"}
      </span>
    </button>
  );
}

/** The shroud, and while the dead player still has their vote, the vote token. */
function DeadMarks({ seat }: { seat: GrimoireSeat }) {
  const { t } = useGrimoire();
  return (
    <span className="absolute -top-1 left-1/2 flex -translate-x-1/2 items-center gap-0.5 text-base leading-none">
      <span title={t.deadMark}>☠</span>
      {!seat.voteUsed && (
        <span className="rounded-full bg-card px-1 text-xs shadow" title={t.ghostVote}>
          🗳
        </span>
      )}
    </span>
  );
}

/**
 * What living characters do to today: no execution with the Vortox, the Leviathan's days, Legion's votes, Riot;
 * the Witch's cursed player, the Mastermind's extra day, the Evil Twin, the Boomdandy executed, the Goblin's claim;
 * the Saint executed, the Klutz, Moonchild and Sweetheart who died, the Butler's master; the Atheist executed, the
 * Mayor with three alive, the Pacifist, the Virgin not nominated yet, the Banshee killed by the Demon; the
 * Buddhist's silence, the Ferryman's final day, the Fiddler's contest.
 */
function dayRules(state: GrimoireState, characters: Record<string, GrimoireCharacter>, t: GrimoireTexts) {
  const alive = (role: string) => players(state).some((s) => s.role === role && !s.dead);
  const executed = tokenOf(characters.leviathan, "goodExecuted");
  const rules: string[] = [];
  if (vortoxWorks(state, characters)) rules.push(t.vortoxDay);
  if (alive("leviathan")) rules.push(fill(t.leviathanDay, { n: state.round, k: remindersOf(state, "leviathan").filter(({ reminder }) => reminder.text === executed).length }));
  if (alive("legion")) rules.push(t.legionDay);
  if (alive("riot") && state.round === 3) rules.push(t.riotDay);
  const cursed = remindersOf(state, "witch").find(({ seat, reminder }) => !seat.dead && characters.witch?.tokenKinds[reminder.text] === "cursed")?.seat;
  if (cursed && abilityWorks(state, "witch", characters)) rules.push(fill(t.witchDay, { name: cursed.name || "?" }));
  // a Demon died by day, today or yesterday, and none lives
  const demonDied = (state.log ?? []).some((e) => e.kind === "death" && e.day && !e.fake && state.round - e.round <= 1 && findRole(e.role)?.team === "demon");
  const demonLives = players(state).some((s) => !s.dead && findRole(s.role)?.team === "demon");
  if (demonDied && !demonLives && abilityWorks(state, "mastermind", characters)) rules.push(t.mastermindDay);
  const twin = remindersOf(state, "eviltwin")[0]?.seat;
  if (twin && !twin.dead && alive("eviltwin")) rules.push(fill(t.evilTwinDay, { name: twin.name || "?" }));
  if ((state.log ?? []).some((e) => e.kind === "death" && e.day && e.round === state.round && e.role === "boomdandy")) rules.push(t.boomdandyDay);
  const claimed = remindersOf(state, "goblin").some(({ seat, reminder }) => seat.role === "goblin" && !seat.dead && reminder.round === state.round);
  if (claimed) rules.push(t.goblinDay);
  // the Outsiders: the Saint executed, who learns they died, the Butler's master
  const today = diedLately(state);
  const saint = (e: (typeof today)[number]) => e.role === "saint" || (e.role === "hermit" && hermitHas(state, { role: "hermit" }, "saint"));
  if (today.some((e) => e.day && saint(e))) rules.push(t.saintDay);
  if (today.some((e) => e.role === "klutz")) rules.push(t.klutzDay);
  if (today.some((e) => e.role === "moonchild")) rules.push(t.moonchildDay);
  if (today.some((e) => e.role === "sweetheart")) rules.push(t.sweetheartDay);
  // the Townsfolk: the Atheist executed, the Mayor's last three, the Pacifist, the Virgin, the Banshee
  if (today.some((e) => e.day && e.role === "atheist")) rules.push(t.atheistDay);
  if (abilityWorks(state, "mayor", characters) && players(state).filter((s) => !s.dead).length === 3) rules.push(t.mayorDay);
  if (abilityWorks(state, "pacifist", characters)) rules.push(t.pacifistDay);
  if (players(state).some((s) => s.role === "virgin" && !s.dead && !s.reminders.some((r) => r.roleId === "virgin"))) rules.push(t.virginDay);
  const banshee = (state.log ?? []).find((e) => e.kind === "death" && e.role === "banshee" && findRole(e.by)?.team === "demon");
  if (banshee) rules.push(fill(t.bansheeDay, { name: banshee.name || "?" }));
  const butler = players(state).find((s) => s.role === "butler" && !s.dead);
  const master = remindersOf(state, "butler")[0]?.seat;
  if (butler && master) rules.push(fill(t.butlerDay, { name: butler.name || "?", master: master.name || "?" }));
  // the Fabled
  if (hasFabled(state, "buddhist")) rules.push(t.buddhistDay);
  if (hasFabled(state, "ferryman") && players(state).filter((s) => !s.dead).length === 3) rules.push(t.ferrymanDay);
  const contest = hasFabled(state, "fiddler") ? fiddleSeats(state) : null;
  if (contest) rules.push(fill(t.fiddle.day, { a: contest.demon.name || "?", b: contest.opponent.name || "?" }));
  return rules;
}

/** The middle of the town: the phase and the numbers a Storyteller keeps asking for; hidden, only what everybody knows. */
export function TownCenter({ phaseLabel }: { phaseLabel: string }) {
  const { state, characters, hidden, t } = useGrimoire();
  const { alive, votes, toExecute } = voteMath(state);
  const count = players(state).length;
  const bluffs = hidden ? [] : state.bluffs.filter((b): b is string => b !== null);
  return (
    <>
      <span className="text-xl font-bold tracking-tight sm:text-2xl">{phaseLabel}</span>
      {count > 0 && (
        <span className="text-sm text-muted">
          {fill(t.aliveCount, { n: alive, m: count })} · {fill(t.votesCount, { n: votes })}
        </span>
      )}
      {state.phase === "day" && alive > 0 && <span className="text-sm font-semibold">{fill(t.toExecute, { n: toExecute })}</span>}
      {state.phase === "day" &&
        !hidden &&
        dayRules(state, characters, t).map((rule) => (
          <span key={rule} className="max-w-56 text-xs font-semibold text-accent">
            {rule}
          </span>
        ))}
      {bluffs.length > 0 && (
        <span className="mt-1 flex items-center gap-1 text-xs text-muted">
          {t.bluffs}:{" "}
          {bluffs.map((b) => (
            <RoleIcon key={b} roleId={b} size={26} />
          ))}
        </span>
      )}
    </>
  );
}
