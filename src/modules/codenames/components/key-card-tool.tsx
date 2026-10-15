"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { inputClass } from "@/components/ui";
import type { Dict, Locale } from "@/i18n/dictionaries";
import { plural } from "@/i18n/plural";
import { generateKeyCards, keyCardSize, renderKeyCardSvg, renderSheets, type SheetLayout } from "@/modules/codenames/lib/keycard";
import { GOLD_BIG_MINES, GOLD_ULTIMATE_MIRRORS } from "@/modules/codenames/lib/profiles";
import type { BoardProfile, GeneratedBoard, TeamChoice } from "@/modules/codenames/lib/types";

type Texts = Dict["admin"]["codenames"];
type ModeId = "GOLD_BIG_MINES" | "GOLD_ULTIMATE_MIRRORS";

/**
 * The modes on offer; names as in the print tool (mines-generator), whose card titles they are too. Mine numbers belong
 * to Big Mines (and can be turned off), the teams' axes to Ultimate Mirrors (always drawn: the mirror board has them).
 */
const MODES: { id: ModeId; name: string; profile: BoardProfile; mines: boolean; desc: "mines" | "mirrors" }[] = [
  { id: "GOLD_BIG_MINES", name: "Big Mines", profile: GOLD_BIG_MINES, mines: true, desc: "mines" },
  { id: "GOLD_ULTIMATE_MIRRORS", name: "Ultimate Mirrors", profile: GOLD_ULTIMATE_MIRRORS, mines: false, desc: "mirrors" },
];

const TEAMS: TeamChoice[] = ["RANDOM", "RED", "BLUE"];

/** The card's width in mm, as two to an A4 page in the print tool; on screen it only sets the proportions. */
const CARD_WIDTH = 92;

/** Cards per A4 page and how they are laid out, as in the print tool */
const LAYOUTS: Record<number, SheetLayout> = {
  1: { columns: 1, rows: 1 },
  2: { columns: 1, rows: 2 },
  4: { columns: 2, rows: 2 },
  6: { columns: 2, rows: 3 },
  9: { columns: 3, rows: 3 },
  12: { columns: 3, rows: 4 },
};
const MAX_PRINT = 300;

type Settings = {
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
};

const PRINT_DEFAULTS = { count: 12, perPage: 6, showTitle: true, showSeed: true };

// ---------------------------------------------------------------------------------------------
// The settings, kept on this device: a reload (or a phone that slept) shows the same card again

const KEY = "kryci-jmena-v1";
const EVENT = "kryci-jmena";
/** What this page set, also where the browser keeps nothing (a private window) */
let memory: string | null = null;

function read() {
  if (memory !== null) return memory;
  try {
    return localStorage.getItem(KEY);
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
  return { mode: "GOLD_BIG_MINES", team: "RANDOM", showMines: true, minesOnAssassins: false, code: newCode(), card: 1, ...PRINT_DEFAULTS };
}

/** The card's layout as rows of R, B, . (civilian) and X (assassin), for the tests. */
function rowsOf(board: GeneratedBoard) {
  const sign = { RED_AGENT: "R", BLUE_AGENT: "B", CIVILIAN: ".", ASSASSIN: "X" } as const;
  const rows: string[] = [];
  for (let y = 0; y < board.height; y++) {
    rows.push(board.cards.slice(y * board.width, (y + 1) * board.width).map((c) => sign[c.type]).join(""));
  }
  return rows.join("/");
}

// ---------------------------------------------------------------------------------------------

/**
 * Admin → Krycí jména: the spymasters' key card on a phone, from the print tool's generator (modules/codenames/lib):
 * card `n` of a set is the print tool's card `n` of the same code, mode and starting team. Full screen shows only the
 * card, keeps the screen on and steps through the set. Printing puts the first cards of the same set on A4 pages, as the
 * print tool does. The card's own texts (starting team, counts) follow the page's language; the print tool's are Czech.
 */
export function KeyCardTool({ t, lang }: { t: Texts; lang: Locale }) {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const settings = useMemo(() => parse(raw), [raw]);
  const [fullscreen, setFullscreen] = useState(false);

  // the first visit on this device: a set of its own (the store, not `settings`: while hydrating that is the server's null)
  useEffect(() => {
    if (!parse(read())) save(fresh());
  }, [settings]);

  const mode = MODES.find((m) => m.id === settings?.mode) ?? MODES[0];
  const code = settings?.code.trim() ?? "";
  const board = useMemo(() => {
    if (!settings || !code) return null;
    const set = generateKeyCards({ ...mode.profile, primaryTeam: settings.team }, settings.card, code);
    return set[set.length - 1] ?? null;
  }, [settings, mode, code]);
  const svg = useMemo(
    () =>
      board && settings
        ? renderKeyCardSvg(board, keyCardSize(board, CARD_WIDTH, 1000), {
            showMines: mode.mines && settings.showMines,
            minesOnAssassins: settings.minesOnAssassins,
            showAxes: true,
            title: `${mode.name} · ${settings.card}`,
            note: board.seed,
            lang,
          })
        : null,
    [board, settings, mode, lang],
  );

  // the set on A4 pages: one SVG per page, printed alone (the rest of the page is hidden in print)
  const print = useMemo(() => {
    if (!settings || !code) return null;
    const boards = generateKeyCards({ ...mode.profile, primaryTeam: settings.team }, settings.count, code);
    const pages = renderSheets(boards, LAYOUTS[settings.perPage], (b, i) => ({
      showMines: mode.mines && settings.showMines,
      minesOnAssassins: settings.minesOnAssassins,
      showAxes: true,
      title: settings.showTitle ? `${mode.name} · ${i + 1}` : "",
      note: settings.showSeed ? b.seed : "",
      lang,
    }));
    return { cards: boards.length, pages };
    // not on `settings` as a whole: stepping through the cards on the phone does not change the print
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, code, lang, settings?.team, settings?.count, settings?.perPage, settings?.showMines, settings?.minesOnAssassins, settings?.showTitle, settings?.showSeed]);
  const [preview, setPreview] = useState(false);

  const update = (change: Partial<Settings>) => settings && save({ ...settings, ...change });
  const step = (by: number) => settings && save({ ...settings, card: Math.max(1, settings.card + by) });

  // full screen: only the card, over the whole site; the browser's own full screen where it has one (an iPhone has
  // none: the card still fills the window), and the screen stays on in the middle of a game
  useEffect(() => {
    if (!fullscreen) return;
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    // leaving the browser's full screen (Esc, a swipe) closes the card too
    const change = () => !document.fullscreenElement && setFullscreen(false);
    document.addEventListener("fullscreenchange", change);
    let lock: WakeLockSentinel | null = null;
    const wake = () => {
      if (document.visibilityState === "visible") navigator.wakeLock?.request("screen").then((l) => (lock = l), () => {});
    };
    wake();
    document.addEventListener("visibilitychange", wake);
    return () => {
      html.style.overflow = overflow;
      document.removeEventListener("fullscreenchange", change);
      document.removeEventListener("visibilitychange", wake);
      void lock?.release();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [fullscreen]);
  useEffect(() => {
    if (!fullscreen) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  const open = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    setFullscreen(true);
  };

  if (!settings) return null;

  const option = "flex cursor-pointer flex-col rounded-lg border border-border bg-card px-3 py-2 has-[:checked]:border-accent has-[:checked]:ring-1 has-[:checked]:ring-accent";
  const segment = "flex-1 cursor-pointer px-2 py-1.5 text-center text-sm has-[:checked]:bg-accent has-[:checked]:font-medium has-[:checked]:text-accent-foreground";
  const arrow = "flex size-11 items-center justify-center rounded-full text-2xl disabled:opacity-30";
  const card = (className: string) =>
    svg && (
      <div
        className={className}
        data-board={board ? rowsOf(board) : undefined}
        data-starts={board?.startingTeam}
        data-seed={board?.seed}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,28rem)]">
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

      <div className="flex flex-col gap-3">
        {card("[&>svg]:h-auto [&>svg]:w-full")}
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => step(-1)} disabled={settings.card === 1} aria-label={t.previous} className={`${arrow} border border-border`}>
            ‹
          </button>
          <span className="text-sm" data-testid="codenames-card-number">
            {t.card} {settings.card}
          </span>
          <button type="button" onClick={() => step(1)} aria-label={t.next} className={`${arrow} border border-border`}>
            ›
          </button>
        </div>
        <button type="button" onClick={open} disabled={!svg} className="rounded-md bg-accent px-4 py-3 font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50">
          {t.fullscreen}
        </button>
        <p className="text-xs text-muted">{t.fullscreenHint}</p>
      </div>

      <section className="flex flex-col gap-4 md:col-span-2" data-testid="codenames-print">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t.print.title}</h2>
          <p className="max-w-3xl text-sm text-muted">{t.print.hint}</p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t.print.count}
            <input
              type="number"
              name="count"
              min={1}
              max={MAX_PRINT}
              defaultValue={settings.count}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1) update({ count: Math.min(MAX_PRINT, n) });
              }}
              // an empty or wrong number is left as the last good one
              onBlur={(e) => (e.target.value = String(settings.count))}
              className={`${inputClass} w-28`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.print.perPage}
            <select name="perPage" value={settings.perPage} onChange={(e) => update({ perPage: Number(e.target.value) })} className={inputClass}>
              {Object.entries(LAYOUTS).map(([n, l]) => (
                <option key={n} value={n}>
                  {n === "1" ? t.print.single : `${n} (${l.columns} × ${l.rows})`}
                </option>
              ))}
            </select>
          </label>
          <div className="flex select-none flex-col gap-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showTitle" checked={settings.showTitle} onChange={(e) => update({ showTitle: e.target.checked })} className="h-4 w-4 accent-accent" />
              {t.print.showTitle}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showSeed" checked={settings.showSeed} onChange={(e) => update({ showSeed: e.target.checked })} className="h-4 w-4 accent-accent" />
              {t.print.showSeed}
            </label>
          </div>
        </div>
        {print && (
          <p className="text-sm" data-testid="codenames-print-status">
            {plural(t.print.cards, print.cards)} · {plural(t.print.pages, print.pages.length)}
            {print.cards < settings.count && <> – {t.print.noMore}</>}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!print?.pages.length}
            className="self-start rounded-md bg-accent px-4 py-2 font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {t.print.button}
          </button>
          <p className="text-xs text-muted">{t.print.tip}</p>
        </div>
        {print && print.pages.length > 0 && (
          <details className="rounded-lg border border-border p-3" onToggle={(e) => setPreview(e.currentTarget.open)}>
            <summary className="cursor-pointer text-sm font-medium">
              {t.print.preview} ({plural(t.print.pages, print.pages.length)})
            </summary>
            {preview && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {print.pages.map((page, i) => (
                  <figure key={i} className="flex flex-col gap-1">
                    <figcaption className="text-xs text-muted">
                      {t.print.page} {i + 1}
                    </figcaption>
                    <div className="border border-border shadow-sm [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: page }} />
                  </figure>
                ))}
              </div>
            )}
          </details>
        )}
      </section>

      {/* printing: only the A4 pages, straight in <body> (the admin's column would be cut by the page); none on screen */}
      <style>{`@page { size: A4 portrait; margin: 0; }
@media print {
  html, body { background: #fff !important; }
  body > :not([data-codenames-pages]) { display: none !important; }
  [data-codenames-pages] { display: block !important; }
}`}</style>
      {print &&
        createPortal(
          <div data-codenames-pages className="hidden" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
            {print.pages.map((page, i) => (
              <div key={i} className="h-[297mm] w-[210mm] overflow-hidden break-after-page last:break-after-auto [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: page }} />
            ))}
          </div>,
          document.body,
        )}

      {/* in <body>: the admin's column is moved with a transform, which would hold a fixed box inside it */}
      {fullscreen &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label={`${mode.name} · ${settings.card}`} className="fixed inset-0 z-50 bg-black text-white" data-testid="codenames-fullscreen">
            {card("absolute inset-0 p-2 [&>svg]:size-full")}
            <button type="button" onClick={() => setFullscreen(false)} aria-label={t.close} className={`${arrow} absolute right-2 top-2 bg-white/10 text-white/70`}>
              ✕
            </button>
            <button type="button" onClick={() => step(-1)} disabled={settings.card === 1} aria-label={t.previous} className={`${arrow} absolute bottom-2 left-2 bg-white/10 text-white/70`}>
              ‹
            </button>
            <button type="button" onClick={() => step(1)} aria-label={t.next} className={`${arrow} absolute bottom-2 right-2 bg-white/10 text-white/70`}>
              ›
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
