"use client";

import type { Dict } from "@/i18n/dictionaries";
import { KEY_CARD_COLORS } from "@/modules/known-names/lib/keycard";
import type { CardType, GeneratedBoard, MirrorAxis, Team } from "@/modules/known-names/lib/types";

type Texts = Dict["admin"]["knownNames"];

const FILL: Record<CardType, string> = {
  RED_AGENT: KEY_CARD_COLORS.RED,
  BLUE_AGENT: KEY_CARD_COLORS.BLUE,
  CIVILIAN: KEY_CARD_COLORS.CIVILIAN,
  ASSASSIN: KEY_CARD_COLORS.ASSASSIN,
};
const TYPES: CardType[] = ["RED_AGENT", "BLUE_AGENT", "CIVILIAN", "ASSASSIN"];

/** The board's size in per cent of its space: from this, by these steps, up to 100 */
export const SCALE_MIN = 40;
export const SCALE_STEP = 10;

/** Where an axis crosses the board, as a share of it: the board is stretched, so its lines are too */
const AXIS_ENDS: Record<MirrorAxis, [string, string, string, string]> = {
  VERTICAL: ["50%", "0", "50%", "100%"],
  HORIZONTAL: ["0", "50%", "100%", "50%"],
  DIAGONAL: ["0", "0", "100%", "100%"],
  ANTI_DIAGONAL: ["0", "100%", "100%", "0"],
};

/** The teams' axes across the board, drawn as on paper: the team's colour on white, a shared axis in both colours. */
function AxisLines({ board }: { board: GeneratedBoard }) {
  const axes = board.mirrorAxes!;
  const first = board.startingTeam;
  const second: Team = first === "RED" ? "BLUE" : "RED";
  const line = (key: string, axis: MirrorAxis, color: string, width: number, dash?: { offset: number }) => {
    const [x1, y1, x2, y2] = AXIS_ENDS[axis];
    return (
      <line
        key={key}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dash ? "16 16" : undefined}
        strokeDashoffset={dash?.offset}
      />
    );
  };
  const lines =
    axes[first] === axes[second]
      ? [line("casing", axes[first], "#fff", 8), line(first, axes[first], KEY_CARD_COLORS[first], 4, { offset: 0 }), line(second, axes[first], KEY_CARD_COLORS[second], 4, { offset: 16 })]
      : [line("casing1", axes[first], "#fff", 8), line("casing2", axes[second], "#fff", 8), line(first, axes[first], KEY_CARD_COLORS[first], 4), line(second, axes[second], KEY_CARD_COLORS[second], 4)];
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
      {lines}
    </svg>
  );
}

/**
 * The key card in full screen: the board over the whole display (its cells stretched to fill it, like the word cards on
 * the table, but never taller than wide: held upright the board is as wide as the display), who starts and the counts
 * in a strip at the side (on the left held sideways, at the top held upright). A tap darkens a cell as guessed, another
 * brings it back; the counts are of the cells not yet guessed. − and + make the board smaller (in the middle of the
 * display) and back.
 */
export function KeyCardScreen({
  board,
  title,
  showMines,
  minesOnAssassins,
  guessed,
  onToggle,
  onClose,
  onStep,
  first,
  scale,
  onScale,
  t,
}: {
  board: GeneratedBoard;
  /** "Big Mines · 3" */
  title: string;
  showMines: boolean;
  minesOnAssassins: boolean;
  /** Indices of the cells guessed */
  guessed: number[];
  onToggle: (cell: number) => void;
  onClose: () => void;
  onStep: (by: number) => void;
  /** The first card of the set: no previous one */
  first: boolean;
  /** How big the board is, in per cent of the space it has (SCALE_MIN–100) */
  scale: number;
  onScale: (scale: number) => void;
  t: Texts;
}) {
  const team = KEY_CARD_COLORS[board.startingTeam];
  const done = new Set(guessed);
  const button = "flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-2xl text-white/70 disabled:opacity-30";
  const small = "flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl text-white/70 disabled:opacity-30";
  // the board's border, padding and gaps, in px (border-4, p-0.5, gap-0.5): the cells get the rest
  const frame = (cells: number) => 12 + 2 * (cells - 1);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex bg-black text-white portrait:flex-col" data-testid="known-names-fullscreen">
      <aside className="flex shrink-0 gap-3 p-2 landscape:w-28 landscape:flex-col landscape:gap-2 landscape:overflow-y-auto portrait:flex-wrap portrait:items-center">
        <button type="button" onClick={onClose} aria-label={t.close} className={button}>
          ✕
        </button>
        <div className="min-w-0 text-sm leading-tight portrait:flex-1">
          <p className="text-white/60">{title}</p>
          <p className="font-semibold" style={{ color: team }}>
            {t.screen.starts[board.startingTeam]}
          </p>
        </div>
        <ul className="flex gap-x-5 gap-y-2 text-xl font-bold landscape:flex-col portrait:order-last portrait:w-full portrait:justify-center">
          {TYPES.map((type) => {
            const total = board.cards.filter((c) => c.type === type).length;
            const left = board.cards.filter((c, i) => c.type === type && !done.has(i)).length;
            return (
              <li key={type} className="flex items-center gap-2" data-count={type}>
                <span className="size-5 shrink-0 rounded-sm ring-1 ring-white/50" style={{ background: FILL[type] }} aria-hidden />
                <span className="sr-only">{t.screen.types[type]}:</span>
                {left}
                {left < total && <span className="text-sm font-normal text-white/50">/{total}</span>}
              </li>
            );
          })}
        </ul>
        <div className="flex gap-1 landscape:mt-auto" data-scale={scale}>
          <button type="button" onClick={() => onScale(scale - SCALE_STEP)} disabled={scale <= SCALE_MIN} aria-label={t.screen.smaller} className={small}>
            −
          </button>
          <button type="button" onClick={() => onScale(scale + SCALE_STEP)} disabled={scale >= 100} aria-label={t.screen.bigger} className={small}>
            +
          </button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onStep(-1)} disabled={first} aria-label={t.previous} className={button}>
            ‹
          </button>
          <button type="button" onClick={() => onStep(1)} aria-label={t.next} className={button}>
            ›
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-2 @container-size landscape:pl-0 portrait:pt-0">
        <div
          className="relative grid gap-0.5 rounded-md border-4 bg-[#4A4A4A] p-0.5"
          style={{
            width: `${scale}cqw`,
            // at most square cells: held upright the full height would make them twice as tall as wide
            height: `min(${scale}cqh, calc((${scale}cqw - ${frame(board.width)}px) * ${board.height / board.width} + ${frame(board.height)}px))`,
            gridTemplateColumns: `repeat(${board.width}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${board.height}, minmax(0, 1fr))`,
            borderColor: team,
          }}
          data-testid="known-names-board"
        >
          {board.cards.map((c, i) => {
            const mines = showMines && (c.type !== "ASSASSIN" || minesOnAssassins);
            return (
              <button
                key={i}
                type="button"
                onClick={() => onToggle(i)}
                aria-pressed={done.has(i)}
                aria-label={t.screen.cell[c.type]}
                className="relative flex size-full touch-manipulation items-center justify-center @container-size"
                style={{ background: FILL[c.type] }}
                data-cell={i}
              >
                {/* the assassin is told apart from a cell darkened as guessed */}
                {c.type === "ASSASSIN" && (
                  <span className={`leading-none ${mines ? "absolute left-[4cqmin] top-[4cqmin] text-[length:22cqmin]" : "text-[length:45cqmin]"}`} aria-hidden>
                    💀
                  </span>
                )}
                {mines && (
                  <span
                    className="flex h-[46cqmin] w-[84cqmin] items-center justify-around rounded-[10cqmin] bg-white text-[length:34cqmin] font-bold leading-none ring-1 ring-black/25"
                    data-mines
                  >
                    <span style={{ color: KEY_CARD_COLORS.RED }}>{c.adjacentRedAgents}</span>
                    <span className="h-3/5 w-px bg-black/20" aria-hidden />
                    <span style={{ color: KEY_CARD_COLORS.BLUE }}>{c.adjacentBlueAgents}</span>
                  </span>
                )}
                {done.has(i) && <span className="absolute inset-0 bg-black/65" aria-hidden />}
              </button>
            );
          })}
          {board.mirrorAxes && <AxisLines board={board} />}
        </div>
      </div>
    </div>
  );
}
