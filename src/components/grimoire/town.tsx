"use client";

import { useEffect, useRef, useState } from "react";
import { linkedRoleOf } from "@/lib/botc-roles";
import { seatSide, voteMath, type GrimoireSeat } from "@/lib/grimoire/state";
import { fill } from "@/lib/grimoire/text";
import { nameOf, RoleIcon, useGrimoire } from "./context";

const LABEL = 22;
const PILL_W = 104;
const PILL_H = 26;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

const sideBorder = { good: "border-good", evil: "border-accent" } as const;

/**
 * The town square: the seats on an ellipse filling the area, clockwise from the top, each with its
 * reminder tokens pointing to the middle; the phase and the vote count in the middle. Sizes follow the
 * area and the number of seats, so it works on a tablet either way round and on a phone.
 */
export function Town({
  selectedId,
  highlightIds,
  onSelect,
  center,
}: {
  selectedId: string | null;
  /** Seats that wake on the night step in focus */
  highlightIds: string[];
  onSelect: (seatId: string) => void;
  center: React.ReactNode;
}) {
  const { state, t } = useGrimoire();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

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
  const places = seats.map((seat, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
    return { seat, x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });

  return (
    <div ref={ref} className="absolute inset-0 select-none" data-testid="town">
      {w > 0 && (
        <>
          <div
            className="pointer-events-none absolute flex flex-col items-center justify-center gap-1 text-center"
            style={{ left: cx - rx * 0.55, top: cy - ry * 0.45, width: rx * 1.1, height: ry * 0.9 }}
          >
            {center}
          </div>
          {places.map(({ seat, x, y }) => {
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
                {seat.reminders.map((r, j) => {
                  const d = start + j * step;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onSelect(seat.id)}
                      className="absolute flex items-center gap-1 rounded-full border border-border bg-card/95 px-1.5 text-[11px] leading-none shadow-sm"
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
                  onClick={() => onSelect(seat.id)}
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

function SeatToken({
  seat,
  size,
  x,
  y,
  selected,
  highlighted,
  onClick,
}: {
  seat: GrimoireSeat;
  size: number;
  x: number;
  y: number;
  selected: boolean;
  highlighted: boolean;
  onClick: () => void;
}) {
  const { locale, t } = useGrimoire();
  const side = seatSide(seat);
  const border = side ? sideBorder[side] : seat.role ? "border-muted" : "border-dashed border-border";
  const ring = selected ? "outline-4 outline-offset-2 outline-accent" : highlighted ? "outline-4 outline-offset-2 outline-amber-400" : "";
  const linked = seat.believedRole && linkedRoleOf(seat.role) ? seat.believedRole : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute flex flex-col items-center"
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
  const bluffs = state.bluffs.filter((b): b is string => b !== null);
  return (
    <>
      <span className="text-xl font-bold tracking-tight sm:text-2xl">{phaseLabel}</span>
      {state.seats.length > 0 && (
        <span className="text-sm text-muted">
          {fill(t.aliveCount, { n: alive, m: state.seats.length })} · {fill(t.votesCount, { n: votes })}
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
