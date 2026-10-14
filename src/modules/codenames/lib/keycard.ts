/**
 * Klíčové kartičky pro vypravěče: sada unikátních karet a jejich vykreslení do SVG (rozměry v mm).
 * Bez DOM – běží v Node i v prohlížeči.
 */
import type { BoardConfig, CardType, GeneratedBoard, MirrorAxis, Team } from "./types";
import { generateBoard } from "./generator";

export const KEY_CARD_COLORS = {
  RED: "#E53935",
  BLUE: "#2F6BFF",
  CIVILIAN: "#EADFC8",
  ASSASSIN: "#151515",
  GRID: "#4A4A4A",
  TEXT: "#222222",
  MUTED: "#7A7A7A",
} as const;

const TEAM_NAME: Record<Team, string> = { RED: "Začínají červení", BLUE: "Začínají modří" };

/** Abstraktní vzor (row-major): P = agent začínajícího týmu, S = druhého týmu, W = civilista, K = vrah. */
export function patternOf(board: GeneratedBoard): string {
  return board.cards
    .map((c) =>
      c.type === "ASSASSIN" ? "K" : c.type === "CIVILIAN" ? "W" : c.type === `${board.startingTeam}_AGENT` ? "P" : "S",
    )
    .join("");
}

/** Otočení vzoru width×height o 90° po směru hodin; výsledek má rozměry height×width. */
function rotate90(pattern: string, width: number, height: number): string {
  const out: string[] = new Array(pattern.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out[x * height + (height - 1 - y)] = pattern[y * width + x]!;
  }
  return out.join("");
}

/**
 * Kanonický klíč vzoru: nejmenší ze všech otočení, ve kterých kartička pasuje na plochu.
 * Čtverec 0/90/180/270°, obdélník jen 0/180° (otočený o 90° by na plochu nepasoval).
 */
export function canonicalPatternKey(board: GeneratedBoard): string {
  const { width, height } = board;
  const p0 = patternOf(board);
  const p90 = rotate90(p0, width, height);
  const p180 = rotate90(p90, height, width);
  const variants = width === height ? [p0, p90, p180, rotate90(p180, width, height)] : [p0, p180];
  return variants.reduce((a, b) => (b < a ? b : a));
}

/**
 * Sada kartiček k tisku. Pokus i má seed `${batchSeed}/${i}`, takže jde každou kartičku znovu
 * vygenerovat přes generateBoard. Vzory, které jsou jen otočením už vybraného, se přeskočí.
 * Když unikátních vzorů není dost (malá plocha), vrátí jich méně.
 */
export function generateKeyCards(
  config: Omit<BoardConfig, "seed">,
  count: number,
  batchSeed: string,
): GeneratedBoard[] {
  const boards: GeneratedBoard[] = [];
  const seen = new Set<string>();
  const maxAttempts = count * 20 + 100;
  for (let i = 1; boards.length < count && i <= maxAttempts; i++) {
    const board = generateBoard({ ...config, seed: `${batchSeed}/${i}` });
    const key = canonicalPatternKey(board);
    if (seen.has(key)) continue;
    seen.add(key);
    boards.push(board);
  }
  return boards;
}

// ---------------------------------------------------------------------------------------------
// SVG

export interface KeyCardStyle {
  /** Do každého pole vepsat počet sousedních červených | modrých agentů (Mines). */
  showMines: boolean;
  /** Ikony os souměrnosti v hlavičce (jen u zrcadlových desek). */
  showAxes: boolean;
  /** Nadpis vlevo nahoře, např. název režimu a číslo kartičky. */
  title: string;
  /** Drobný text vpravo dole, např. seed. */
  note: string;
}

/** Rozvržení kartičky v mm. */
export interface KeyCardSize {
  width: number;
  height: number;
  cell: number;
}

const BORDER = 2.2;
const PAD = 5;
const HEADER = 7;
const FOOTER = 6;

/** Kartička na šířku slotu, výška podle mřížky (nejvýš výška slotu). */
export function keyCardSize(board: Pick<GeneratedBoard, "width" | "height">, slotWidth: number, slotHeight: number): KeyCardSize {
  const cell = Math.min(
    (slotWidth - 2 * PAD) / board.width,
    (slotHeight - 2 * PAD - HEADER - FOOTER) / board.height,
  );
  return { width: slotWidth, height: 2 * PAD + HEADER + FOOTER + cell * board.height, cell };
}

const n = (v: number) => +v.toFixed(2);

function escapeXml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
}

function cellFill(type: CardType): string {
  switch (type) {
    case "RED_AGENT":
      return KEY_CARD_COLORS.RED;
    case "BLUE_AGENT":
      return KEY_CARD_COLORS.BLUE;
    case "CIVILIAN":
      return KEY_CARD_COLORS.CIVILIAN;
    case "ASSASSIN":
      return KEY_CARD_COLORS.ASSASSIN;
  }
}

/** Čtvereček s čarou ve směru osy. */
function axisIcon(axis: MirrorAxis, x: number, y: number, size: number, color: string): string {
  const [x1, y1, x2, y2] = {
    VERTICAL: [size / 2, 0, size / 2, size],
    HORIZONTAL: [0, size / 2, size, size / 2],
    DIAGONAL: [0, 0, size, size],
    ANTI_DIAGONAL: [0, size, size, 0],
  }[axis];
  return (
    `<g transform="translate(${n(x)} ${n(y)})">` +
    `<rect width="${n(size)}" height="${n(size)}" fill="#fff" stroke="${KEY_CARD_COLORS.GRID}" stroke-width="0.25"/>` +
    `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${color}" stroke-width="0.8" stroke-linecap="round"/>` +
    `</g>`
  );
}

/** Jedna kartička jako vnořený <svg> umístěný na (x, y). */
export function renderKeyCardSvg(board: GeneratedBoard, size: KeyCardSize, style: KeyCardStyle, x = 0, y = 0): string {
  const { width: W, height: H, cell } = size;
  const team = KEY_CARD_COLORS[board.startingTeam];
  const font = Math.min(3.6, Math.max(2.4, W / 30));
  const gridW = cell * board.width;
  const gx = (W - gridW) / 2;
  const gy = PAD + HEADER;
  const parts: string[] = [];

  parts.push(
    `<rect x="${n(BORDER / 2)}" y="${n(BORDER / 2)}" width="${n(W - BORDER)}" height="${n(H - BORDER)}" rx="3" fill="#fff" stroke="${team}" stroke-width="${BORDER}"/>`,
  );
  if (style.title) {
    parts.push(
      `<text x="${n(gx)}" y="${n(PAD + HEADER * 0.55)}" font-size="${n(font)}" font-weight="600" fill="${KEY_CARD_COLORS.TEXT}">${escapeXml(style.title)}</text>`,
    );
  }
  if (style.showAxes && board.mirrorAxes) {
    const icon = HEADER * 0.62;
    const iy = PAD + (HEADER - icon) / 2 - 0.8;
    const other: Team = board.startingTeam === "RED" ? "BLUE" : "RED";
    parts.push(axisIcon(board.mirrorAxes[other], gx + gridW - icon, iy, icon, KEY_CARD_COLORS[other]));
    parts.push(axisIcon(board.mirrorAxes[board.startingTeam], gx + gridW - 2 * icon - 1.2, iy, icon, team));
  }

  for (const c of board.cards) {
    const cx = gx + c.x * cell;
    const cy = gy + c.y * cell;
    parts.push(
      `<rect x="${n(cx)}" y="${n(cy)}" width="${n(cell)}" height="${n(cell)}" fill="${cellFill(c.type)}" stroke="${KEY_CARD_COLORS.GRID}" stroke-width="0.25"/>`,
    );
    if (style.showMines) {
      const bw = cell * 0.84;
      const bh = cell * 0.46;
      const mx = cx + cell / 2;
      const my = cy + cell / 2;
      const fs = cell * 0.34;
      parts.push(
        `<rect x="${n(mx - bw / 2)}" y="${n(my - bh / 2)}" width="${n(bw)}" height="${n(bh)}" rx="${n(cell * 0.1)}" fill="#fff" stroke="#000" stroke-opacity="0.25" stroke-width="0.15"/>` +
          `<line x1="${n(mx)}" y1="${n(my - bh * 0.3)}" x2="${n(mx)}" y2="${n(my + bh * 0.3)}" stroke="#000" stroke-opacity="0.2" stroke-width="0.15"/>` +
          `<text y="${n(my + fs * 0.36)}" font-size="${n(fs)}" font-weight="700" text-anchor="middle">` +
          `<tspan x="${n(mx - bw / 4)}" fill="${KEY_CARD_COLORS.RED}">${c.adjacentRedAgents}</tspan>` +
          `<tspan x="${n(mx + bw / 4)}" fill="${KEY_CARD_COLORS.BLUE}">${c.adjacentBlueAgents}</tspan></text>`,
      );
    }
  }
  parts.push(
    `<rect x="${n(gx)}" y="${n(gy)}" width="${n(gridW)}" height="${n(cell * board.height)}" fill="none" stroke="${KEY_CARD_COLORS.GRID}" stroke-width="0.5"/>`,
  );

  const fy = H - PAD - FOOTER * 0.2;
  parts.push(
    `<text x="${n(gx)}" y="${n(fy)}" font-size="${n(font)}" font-weight="700" fill="${team}">${TEAM_NAME[board.startingTeam]}</text>`,
  );
  if (style.note) {
    parts.push(
      `<text x="${n(gx + gridW)}" y="${n(fy)}" font-size="${n(font * 0.75)}" text-anchor="end" fill="${KEY_CARD_COLORS.MUTED}">${escapeXml(style.note)}</text>`,
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" x="${n(x)}" y="${n(y)}" width="${n(W)}" height="${n(H)}" viewBox="0 0 ${n(W)} ${n(H)}"` +
    ` font-family="system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif">${parts.join("")}</svg>`
  );
}

export const A4 = { width: 210, height: 297 } as const;
const PAGE_MARGIN = 10;
const CARD_GAP = 6;

export interface SheetLayout {
  columns: number;
  rows: number;
}

/**
 * Rozloží kartičky na stránky A4 (na výšku). Vrací jedno SVG na stránku, viewBox v mm.
 * Všechny kartičky v sadě mají stejný rozměr, blok karet je na stránce vystředěný.
 */
export function renderSheets(
  boards: readonly GeneratedBoard[],
  layout: SheetLayout,
  styleOf: (board: GeneratedBoard, index: number) => KeyCardStyle,
): string[] {
  if (boards.length === 0) return [];
  const { columns, rows } = layout;
  const slotW = (A4.width - 2 * PAGE_MARGIN - (columns - 1) * CARD_GAP) / columns;
  const slotH = (A4.height - 2 * PAGE_MARGIN - (rows - 1) * CARD_GAP) / rows;
  const size = keyCardSize(boards[0]!, slotW, slotH);
  const blockW = columns * size.width + (columns - 1) * CARD_GAP;
  const blockH = rows * size.height + (rows - 1) * CARD_GAP;
  const left = (A4.width - blockW) / 2;
  const top = (A4.height - blockH) / 2;

  const perPage = columns * rows;
  const pages: string[] = [];
  for (let start = 0; start < boards.length; start += perPage) {
    const cards = boards.slice(start, start + perPage).map((board, i) => {
      const x = left + (i % columns) * (size.width + CARD_GAP);
      const y = top + Math.floor(i / columns) * (size.height + CARD_GAP);
      return renderKeyCardSvg(board, size, styleOf(board, start + i), x, y);
    });
    pages.push(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${A4.width} ${A4.height}" width="${A4.width}mm" height="${A4.height}mm">` +
        `<rect width="${A4.width}" height="${A4.height}" fill="#fff"/>${cards.join("")}</svg>`,
    );
  }
  return pages;
}
