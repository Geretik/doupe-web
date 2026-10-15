"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { inputClass } from "@/components/ui";
import type { Dict, Locale } from "@/i18n/dictionaries";
import { generateKeyCards, keyCardSize, renderKeyCardSvg } from "@/modules/codenames/lib/keycard";
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

type Settings = { mode: ModeId; team: TeamChoice; showMines: boolean; minesOnAssassins: boolean; code: string; card: number };

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
  return { mode: "GOLD_BIG_MINES", team: "RANDOM", showMines: true, minesOnAssassins: false, code: newCode(), card: 1 };
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
 * card, keeps the screen on and steps through the set. The card's own texts (starting team, counts) follow the page's
 * language; the print tool's are Czech.
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
          <fieldset className="flex flex-col gap-2 text-sm">
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
