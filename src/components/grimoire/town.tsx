"use client";

import { useEffect, useRef, useState } from "react";
import { linkedRoleOf } from "@/lib/botc-roles";
import { moveSeat, players, seatSide, voteMath, type GapKind, type GrimoireSeat } from "@/lib/grimoire/state";
import { fill } from "@/lib/grimoire/text";
import { nameOf, RoleIcon, useGrimoire } from "./context";

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

export const gapIcon: Record<GapKind, string> = { door: "🚪", storyteller: "🎩" };

/**
 * The town square: the circle on an ellipse filling the area, clockwise, each player with their reminder
 * tokens pointing to the middle; the phase and the vote count in the middle. The Storyteller's spot is at
 * the bottom, so the tablet shows the table as the Storyteller sees it (without one the first seat is at
 * the top). Sizes follow the area and the number of places, so it works on a tablet either way round and
 * on a phone. With `onMove`, a place is dragged to another one; the places in between make room.
 */
export function Town({
  selectedId,
  highlightIds,
  onSelect,
  onMove,
  center,
  hideRoles = false,
  onBackground,
}: {
  selectedId: string | null;
  /** Seats that wake on the night step in focus */
  highlightIds: string[];
  onSelect: (seatId: string) => void;
  /** A place dragged to the place `to` of the circle; absent = the places stay put */
  onMove?: (seatId: string, to: number) => void;
  center: React.ReactNode;
  /** The players hold the tablet (the draw): characters face down, no reminders */
  hideRoles?: boolean;
  /** A tap on the square where there is no place, e.g. to let go of the selected player */
  onBackground?: () => void;
}) {
  const { state, t } = useGrimoire();
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
  const { w, h } = size;
  const radius = Math.min(w, h - LABEL) / 2;
  const token = clamp(((2 * Math.PI * radius) / Math.max(n, 1)) * 0.68, 44, 104);
  const pill = clamp(token * 0.32, 20, PILL_H);
  const cx = w / 2;
  const cy = (h - LABEL) / 2;
  const rx = Math.max(0, w / 2 - token / 2 - 4);
  const ry = Math.max(0, (h - LABEL) / 2 - token / 2 - 4);
  const storyteller = seats.findIndex((s) => s.gap === "storyteller");
  const first = storyteller >= 0 ? Math.PI / 2 - (2 * Math.PI * storyteller) / n : -Math.PI / 2;
  const step = (2 * Math.PI) / Math.max(n, 1);
  // while a place is dragged: the circle as it would be after the drop, the dragged one under the finger
  const order = drag ? moveSeat(seats, drag.from, drag.to) : seats;
  const places = seats.map((seat) => {
    if (drag?.id === seat.id) return { seat, x: drag.x, y: drag.y };
    const angle = first + step * order.indexOf(seat);
    return { seat, x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });

  const press = (e: React.PointerEvent, seatId: string) => {
    if (!onMove || !e.isPrimary || e.button !== 0) return;
    stopDrag.current?.();
    dragged.current = false;
    const box = ref.current!.getBoundingClientRect();
    const { pointerId, clientX: startX, clientY: startY } = e;
    const from = seats.findIndex((s) => s.id === seatId);
    let to = from;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!dragged.current && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_START) return;
      dragged.current = true;
      const x = ev.clientX - box.left;
      const y = ev.clientY - box.top;
      // the place of the circle nearest to the finger
      const angle = Math.atan2((y - cy) / (ry || 1), (x - cx) / (rx || 1));
      to = ((Math.round((angle - first) / step) % n) + n) % n;
      setDrag({ id: seatId, from, to, x, y });
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      stop();
      if (dragged.current && ev.type === "pointerup") onMove(seatId, to);
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

  return (
    <div ref={ref} className="absolute inset-0 select-none" data-testid="town" onClick={(e) => e.target === e.currentTarget && onBackground?.()}>
      {w > 0 && (
        <>
          <div
            className="pointer-events-none absolute flex flex-col items-center justify-center gap-1 text-center"
            style={{ left: cx - rx * 0.55, top: cy - ry * 0.45, width: rx * 1.1, height: ry * 0.9 }}
          >
            {center}
          </div>
          {places.map(({ seat, x, y }) => {
            if (seat.gap) {
              return (
                <Gap key={seat.id} gap={seat.gap} size={token} x={x} y={y} selected={seat.id === selectedId} onClick={() => select(seat.id)} {...moving(seat.id)} />
              );
            }
            const dx = cx - x;
            const dy = cy - y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            // along the way to the middle; horizontal neighbours need a pill's width, vertical ones its height
            const step = Math.abs(ux) * (PILL_W + 6) + Math.abs(uy) * (pill + 6);
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
                      className={`absolute flex items-center gap-1 rounded-full border border-border bg-card/95 px-1.5 text-[11px] leading-none shadow-sm ${glide}`}
                      style={{ left: x + ux * d - PILL_W / 2, top: y + uy * d - pill / 2, maxWidth: PILL_W, height: pill }}
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
            <p className="absolute inset-x-0 text-center text-muted" style={{ top: cy - 12 }}>
              {t.noSeats}
            </p>
          )}
        </>
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
  const { t } = useGrimoire();
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
      <span className="mt-0.5 text-xs text-muted">{t.gaps[gap]}</span>
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
  const { locale, t } = useGrimoire();
  if (hidden) {
    // face down: whether the place has drawn, never what
    return (
      <button
        type="button"
        onClick={onClick}
        className="absolute flex flex-col items-center"
        style={{ left: x - size / 2, top: y - size / 2, width: size }}
        data-testid="seat"
        data-seat={seat.name}
        data-drawn={seat.role ? "yes" : "no"}
      >
        <span
          className={`flex items-center justify-center rounded-full border-[3px] shadow-md ${seat.role ? "border-foreground/70 bg-foreground/80 text-background" : "border-dashed border-accent/60 bg-card text-accent"}`}
          style={{ width: size, height: size, fontSize: size * 0.4 }}
        >
          {seat.role ? "✓" : "?"}
        </span>
        <span className="mt-0.5 max-w-[150%] truncate text-sm leading-tight font-semibold">{seat.name || "\u00a0"}</span>
      </button>
    );
  }
  const side = seatSide(seat);
  const border = side ? sideBorder[side] : seat.role ? "border-muted" : "border-dashed border-border";
  const ring = selected ? "outline-4 outline-offset-2 outline-accent" : highlighted ? "outline-4 outline-offset-2 outline-amber-400" : "";
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
            <span className="max-w-[88%] truncate leading-tight font-semibold" style={{ fontSize: clamp(size * 0.12, 9, 13) }}>
              {nameOf(seat.role, locale)}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted">{t.noRole}</span>
        )}
        {seat.dead && <span className="absolute inset-0 rounded-full bg-black/45" aria-hidden />}
      </span>
      {seat.dead && (
        // the shroud, and while the dead player still has their vote, the vote token
        <span className="absolute -top-1 left-1/2 flex -translate-x-1/2 items-center gap-0.5 text-base leading-none">
          <span title={t.deadMark}>☠</span>
          {!seat.voteUsed && <span className="rounded-full bg-card px-1 text-xs shadow" title={t.ghostVote}>🗳</span>}
        </span>
      )}
      {linked && (
        <span className="absolute rounded-full border border-border bg-card p-0.5 shadow" style={{ left: -4, top: size * 0.62 }}>
          <RoleIcon roleId={linked} size={clamp(size * 0.3, 16, 28)} />
        </span>
      )}
      <span className={`mt-0.5 max-w-[150%] truncate text-sm leading-tight font-semibold ${seat.dead ? "text-muted line-through" : ""}`}>
        {seat.name || "?"}
      </span>
    </button>
  );
}

/** The middle of the town: the phase and the numbers a Storyteller keeps asking for. */
export function TownCenter({ phaseLabel }: { phaseLabel: string }) {
  const { state, t } = useGrimoire();
  const { alive, votes, toExecute } = voteMath(state);
  const count = players(state).length;
  const bluffs = state.bluffs.filter((b): b is string => b !== null);
  return (
    <>
      <span className="text-xl font-bold tracking-tight sm:text-2xl">{phaseLabel}</span>
      {count > 0 && (
        <span className="text-sm text-muted">
          {fill(t.aliveCount, { n: alive, m: count })} · {fill(t.votesCount, { n: votes })}
        </span>
      )}
      {state.phase === "day" && alive > 0 && <span className="text-sm font-semibold">{fill(t.toExecute, { n: toExecute })}</span>}
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
