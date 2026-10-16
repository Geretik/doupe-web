"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { KeyCardScreen, SCALE_MIN } from "@/modules/codenames/components/key-card-screen";
import { SetForm, useKeyCardSettings, type Texts } from "@/modules/codenames/components/key-card-settings";
import { generateKeyCards } from "@/modules/codenames/lib/keycard";
import type { GeneratedBoard } from "@/modules/codenames/lib/types";

/** The card's layout as rows of R, B, . (civilian) and X (assassin), for the tests. */
function rowsOf(board: GeneratedBoard) {
  const sign = { RED_AGENT: "R", BLUE_AGENT: "B", CIVILIAN: ".", ASSASSIN: "X" } as const;
  const rows: string[] = [];
  for (let y = 0; y < board.height; y++) {
    rows.push(board.cards.slice(y * board.width, (y + 1) * board.width).map((c) => sign[c.type]).join(""));
  }
  return rows.join("/");
}

/**
 * Admin → Krycí jména: the spymasters' key card on a phone, from the print tool's generator (modules/codenames/lib):
 * card `n` of a set is the print tool's card `n` of the same code, mode and starting team. The card shows only in full
 * screen (KeyCardScreen), which keeps the screen on, steps through the set and darkens the cells tapped as guessed.
 * The same set goes on A4 pages in Krycí jména → Tisk (KeyCardPrint). The card's own texts (starting team, counts)
 * follow the page's language; the print tool's are Czech.
 */
export function KeyCardTool({ t }: { t: Texts }) {
  const { settings, mode, code, update } = useKeyCardSettings();
  const [fullscreen, setFullscreen] = useState(false);

  const board = useMemo(() => {
    if (!settings || !code) return null;
    const set = generateKeyCards({ ...mode.profile, primaryTeam: settings.team }, settings.card, code);
    return set[set.length - 1] ?? null;
  }, [settings, mode, code]);
  // the marks belong to this very card: another one (stepping, another mode, team or code) starts with none
  const boardKey = board && settings ? `${mode.id}/${settings.team}/${board.seed}` : "";
  const guessed = settings?.guessed?.card === boardKey ? settings.guessed.cells : [];

  const step = (by: number) => settings && update({ card: Math.max(1, settings.card + by) });
  const toggle = (cell: number) =>
    update({ guessed: { card: boardKey, cells: guessed.includes(cell) ? guessed.filter((c) => c !== cell) : [...guessed, cell] } });

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

  const arrow = "flex size-11 items-center justify-center rounded-full text-2xl disabled:opacity-30";
  /** what the tests read of the card shown */
  const cardData = board ? { "data-board": rowsOf(board), "data-starts": board.startingTeam, "data-seed": board.seed } : {};

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,28rem)]">
      <SetForm t={t} settings={settings} mode={mode} code={code} update={update} />

      <div className="flex flex-col gap-3">
        {/* the card itself only in full screen */}
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border px-4 py-10 text-center" data-testid="codenames-card" {...cardData}>
          <span className="text-4xl" aria-hidden>
            🙈
          </span>
          <p className="text-sm text-muted">{t.hidden}</p>
          <button type="button" onClick={open} disabled={!board} className="rounded-md bg-accent px-4 py-3 font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50">
            {t.fullscreen}
          </button>
        </div>
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
        <p className="text-xs text-muted">{t.fullscreenHint}</p>
      </div>

      {/* in <body>: the admin's column is moved with a transform, which would hold a fixed box inside it */}
      {fullscreen &&
        board &&
        createPortal(
          <KeyCardScreen
            board={board}
            title={`${mode.name} · ${settings.card}`}
            showMines={mode.mines && settings.showMines}
            minesOnAssassins={settings.minesOnAssassins}
            guessed={guessed}
            onToggle={toggle}
            onClose={() => setFullscreen(false)}
            onStep={step}
            first={settings.card === 1}
            scale={settings.scale}
            onScale={(scale) => update({ scale: Math.min(100, Math.max(SCALE_MIN, scale)) })}
            t={t}
          />,
          document.body,
        )}
    </div>
  );
}
