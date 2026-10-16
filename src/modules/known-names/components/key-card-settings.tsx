"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { inputClass } from "@/components/ui";
import type { Dict } from "@/i18n/dictionaries";
import { SCALE_MIN } from "@/modules/known-names/components/key-card-screen";
import type { SheetLayout } from "@/modules/known-names/lib/keycard";
import { GOLD_BIG_MINES, GOLD_ULTIMATE_MIRRORS } from "@/modules/known-names/lib/profiles";
import type { BoardProfile, TeamChoice } from "@/modules/known-names/lib/types";

/*
 * The set of key cards that the card on a phone (KeyCardTool) and the A4 pages (KeyCardPrint) share: mode, starting
 * team, mine numbers and code, kept on this device, and the form that picks them. Card `n` of a set is the print
 * tool's (mines-generator) card `n` of the same code, mode and starting team.
 */

export type Texts = Dict["admin"]["knownNames"];
type ModeId = "GOLD_BIG_MINES" | "GOLD_ULTIMATE_MIRRORS";
export type Mode = (typeof MODES)[number];

/**
 * The modes on offer; names as in the print tool (mines-generator), whose card titles they are too. Mine numbers belong
 * to Big Mines (and can be turned off), the teams' axes to Ultimate Mirrors (always drawn: the mirror board has them).
 */
const MODES: { id: ModeId; name: string; profile: BoardProfile; mines: boolean; desc: "mines" | "mirrors" }[] = [
  { id: "GOLD_BIG_MINES", name: "Big Mines", profile: GOLD_BIG_MINES, mines: true, desc: "mines" },
  { id: "GOLD_ULTIMATE_MIRRORS", name: "Ultimate Mirrors", profile: GOLD_ULTIMATE_MIRRORS, mines: false, desc: "mirrors" },
];

const TEAMS: TeamChoice[] = ["RANDOM", "RED", "BLUE"];

/** Cards per A4 page and how they are laid out, as in the print tool */
export const LAYOUTS: Record<number, SheetLayout> = {
  1: { columns: 1, rows: 1 },
  2: { columns: 1, rows: 2 },
  4: { columns: 2, rows: 2 },
  6: { columns: 2, rows: 3 },
  9: { columns: 3, rows: 3 },
  12: { columns: 3, rows: 4 },
};
export const MAX_PRINT = 300;

export type Settings = {
  mode: ModeId;
  team: TeamChoice;
  showMines: boolean;
  minesOnAssassins: boolean;
  code: string;
  card: number;
  /** printing: how many cards of the set, how many to a page, title and code on each */
  count: number;
  perPage: number;
  showTitle: boolean;
  showSeed: boolean;
  /** the cells darkened as guessed in full screen, of the card `card` (another card starts with none) */
  guessed: { card: string; cells: number[] } | null;
  /** the board's size in full screen, per cent of the display (100 fills it) */
  scale: number;
};

const PRINT_DEFAULTS = { count: 12, perPage: 6, showTitle: true, showSeed: true };

// ---------------------------------------------------------------------------------------------
// The settings, kept on this device: a reload (or a phone that slept) shows the same card again

const KEY = "znama-jmena-v1";
/** Where the settings were kept while the tool was called Krycí jména (until October 2026); read until saved anew */
const OLD_KEY = "kryci-jmena-v1";
const EVENT = "znama-jmena";
/** What this page set, also where the browser keeps nothing (a private window) */
let memory: string | null = null;

function read() {
  if (memory !== null) return memory;
  try {
    return localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
  } catch {
    return null;
  }
}

function save(settings: Settings) {
  memory = JSON.stringify(settings);
  try {
    localStorage.setItem(KEY, memory);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function parse(raw: string | null): Settings | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Settings>;
    if (!MODES.some((m) => m.id === s.mode) || !TEAMS.includes(s.team as TeamChoice) || typeof s.code !== "string") return null;
    const card = Number.isInteger(s.card) && s.card! >= 1 ? s.card! : 1;
    return {
      mode: s.mode!,
      team: s.team!,
      showMines: s.showMines !== false,
      minesOnAssassins: s.minesOnAssassins === true,
      code: s.code,
      card,
      count: Number.isInteger(s.count) && s.count! >= 1 ? Math.min(MAX_PRINT, s.count!) : PRINT_DEFAULTS.count,
      perPage: LAYOUTS[s.perPage!] ? s.perPage! : PRINT_DEFAULTS.perPage,
      showTitle: s.showTitle !== false,
      showSeed: s.showSeed !== false,
      guessed:
        typeof s.guessed?.card === "string" && Array.isArray(s.guessed.cells) && s.guessed.cells.every((c) => Number.isInteger(c))
          ? { card: s.guessed.card, cells: s.guessed.cells }
          : null,
      scale: Number.isInteger(s.scale) ? Math.min(100, Math.max(SCALE_MIN, s.scale!)) : 100,
    };
  } catch {
    return null;
  }
}

/** A short set code without easily confused characters (l/1, o/0), like the print tool's. */
function newCode() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function fresh(): Settings {
  return { mode: "GOLD_BIG_MINES", team: "RANDOM", showMines: true, minesOnAssassins: false, code: newCode(), card: 1, ...PRINT_DEFAULTS, guessed: null, scale: 100 };
}

/**
 * The settings of this device (null until the browser's are read), the mode picked, the code trimmed, and `update`,
 * which saves a change for the other page too.
 */
export function useKeyCardSettings() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const settings = useMemo(() => parse(raw), [raw]);

  // the first visit on this device: a set of its own (the store, not `settings`: while hydrating that is the server's null)
  useEffect(() => {
    if (!parse(read())) save(fresh());
  }, [settings]);

  const mode = MODES.find((m) => m.id === settings?.mode) ?? MODES[0];
  const code = settings?.code.trim() ?? "";
  const update = (change: Partial<Settings>) => settings && save({ ...settings, ...change });
  return { settings, mode, code, update };
}

// ---------------------------------------------------------------------------------------------

/** The set: mode, who starts, the mine numbers of Big Mines and the code. Another set starts at card 1. */
export function SetForm({ t, settings, mode, code, update }: { t: Texts; settings: Settings; mode: Mode; code: string; update: (change: Partial<Settings>) => void }) {
  const option = "flex cursor-pointer flex-col rounded-lg border border-border bg-card px-3 py-2 has-[:checked]:border-accent has-[:checked]:ring-1 has-[:checked]:ring-accent";
  const segment = "flex-1 cursor-pointer px-2 py-1.5 text-center text-sm has-[:checked]:bg-accent has-[:checked]:font-medium has-[:checked]:text-accent-foreground";
  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{t.mode}</legend>
        {MODES.map((m) => (
          <label key={m.id} className={option}>
            <input
              type="radio"
              name="mode"
              value={m.id}
              checked={settings.mode === m.id}
              onChange={() => update({ mode: m.id, showMines: true, card: 1 })}
              className="sr-only"
            />
            <span className="font-medium">{m.name}</span>
            <span className="text-xs text-muted">{t[m.desc]}</span>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t.starts}</legend>
        <div className="flex overflow-hidden rounded-lg border border-border">
          {TEAMS.map((team) => (
            <label key={team} className={segment}>
              <input type="radio" name="team" value={team} checked={settings.team === team} onChange={() => update({ team, card: 1 })} className="sr-only" />
              {team === "RANDOM" ? t.random : team === "RED" ? t.red : t.blue}
            </label>
          ))}
        </div>
      </fieldset>

      {/* mine numbers only in Big Mines, on whenever the mode is picked */}
      {mode.mines && (
        <fieldset className="flex select-none flex-col gap-2 text-sm">
          <legend className="mb-2 font-semibold">{t.onCard}</legend>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="showMines" checked={settings.showMines} onChange={(e) => update({ showMines: e.target.checked })} className="mt-0.5 h-4 w-4 accent-accent" />
            {t.showMines}
          </label>
          <label className={`ml-7 flex items-start gap-3 ${settings.showMines ? "" : "opacity-50"}`}>
            <input
              type="checkbox"
              name="minesOnAssassins"
              checked={settings.minesOnAssassins}
              disabled={!settings.showMines}
              onChange={(e) => update({ minesOnAssassins: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            {t.minesOnAssassins}
          </label>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{t.code}</legend>
        <div className="flex gap-2">
          <input
            name="code"
            value={settings.code}
            onChange={(e) => update({ code: e.target.value, card: 1 })}
            onBlur={() => !code && update({ code: newCode() })}
            spellCheck={false}
            autoComplete="off"
            aria-label={t.code}
            className={`${inputClass} min-w-0 flex-1 font-mono`}
          />
          <button type="button" onClick={() => update({ code: newCode(), card: 1 })} className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-border/40">
            {t.newSet}
          </button>
        </div>
        <p className="text-xs text-muted">{t.codeHint}</p>
      </fieldset>
    </form>
  );
}
