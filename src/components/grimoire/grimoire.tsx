"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Locale } from "@/i18n/dictionaries";
import type { GrimoireCharacter } from "@/lib/grimoire/characters";
import { moveSeat, nextPhase, nightSteps, type GrimoireState } from "@/lib/grimoire/state";
import { useAutosave, type SaveStatus } from "./autosave";
import { DrawView } from "./draw";
import { fill } from "@/lib/grimoire/text";
import { GrimoireContext, type GrimoireContextValue, type GrimoireTexts } from "./context";
import { GamePanel } from "./game-panel";
import { NightPanel } from "./night-panel";
import { SeatPanel } from "./seat-panel";
import { SetupPanel, type ScriptChoice } from "./setup-panel";
import { Town, TownCenter } from "./town";

const UNDO_LIMIT = 100;

type History = { present: GrimoireState; past: GrimoireState[] };
type Change = { type: "apply"; change: (s: GrimoireState) => GrimoireState } | { type: "undo" } | { type: "replace"; state: GrimoireState };

function reducer(h: History, a: Change): History {
  if (a.type === "undo") return h.past.length ? { present: h.past[h.past.length - 1], past: h.past.slice(0, -1) } : h;
  if (a.type === "replace") return { present: a.state, past: [] };
  const next = a.change(h.present);
  return next === h.present ? h : { present: next, past: [...h.past, h.present].slice(-UNDO_LIMIT) };
}

type Tab = "seat" | "night" | "setup" | "game";

const statusClass: Record<SaveStatus, string> = {
  saved: "text-muted",
  pending: "text-muted",
  saving: "text-muted",
  offline: "font-semibold text-amber-600",
  conflict: "font-semibold text-accent",
  invalid: "font-semibold text-accent",
};

/** The grimoire page: the town on the left (on top in portrait), the panel for the seat, the night, the setup and the game on the right. */
export function Grimoire({
  id,
  name,
  initial,
  canEdit,
  characters,
  scripts,
  session,
  sessionPlayers,
  recorded: initiallyRecorded,
  locale,
  t,
}: {
  id: number;
  name: string;
  initial: { state: GrimoireState; version: number };
  canEdit: boolean;
  characters: Record<string, GrimoireCharacter>;
  scripts: ScriptChoice[];
  session: { id: number; title: string } | null;
  /** The session's signed-up players, for naming the seats */
  sessionPlayers: { id: number; nickname: string }[];
  recorded: boolean;
  locale: Locale;
  t: GrimoireTexts;
}) {
  const [history, dispatch] = useReducer(reducer, { present: initial.state, past: [] });
  const state = history.present;
  const [tab, setTab] = useState<Tab>(initial.state.phase === "night" ? "night" : initial.state.phase === "setup" ? "setup" : "seat");
  const [selected, setSelected] = useState<string | null>(null);
  const [focusStep, setFocusStep] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(initiallyRecorded);
  const [fullscreen, setFullscreen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const update = useCallback((change: (s: GrimoireState) => GrimoireState) => canEdit && dispatch({ type: "apply", change }), [canEdit]);
  const save = useAutosave({
    id,
    state,
    version: initial.version,
    readOnly: !canEdit,
    onRestore: (restored) => dispatch({ type: "replace", state: restored }),
    onSaved: (r) => r.recorded && setRecorded(true),
  });

  // a tablet on the table must not go dark in the middle of a night
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = () => {
      if (document.visibilityState === "visible") navigator.wakeLock?.request("screen").then((l) => (lock = l), () => {});
    };
    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, []);

  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);

  const steps = useMemo(() => (state.phase === "night" ? nightSteps(state, characters, state.round === 1) : []), [state, characters]);
  const currentStep = steps.find((s) => !state.nightDone.includes(s.id)) ?? null;
  const focused = steps.find((s) => s.id === focusStep) ?? currentStep;

  const context: GrimoireContextValue = { state, update, readOnly: !canEdit || state.phase === "ended", characters, sessionPlayers, locale, t };

  const advance = () => {
    const next = nextPhase(state);
    update(() => next);
    setFocusStep(null);
    if (next.phase === "night") setTab("night");
    else if (tab === "night" || tab === "setup") setTab("seat");
  };
  const moveTo = (seatId: string, to: number) =>
    update((s) => {
      const seats = moveSeat(s.seats, s.seats.findIndex((x) => x.id === seatId), to);
      return seats === s.seats ? s : { ...s, seats };
    });
  const phaseLabel =
    state.phase === "setup" ? t.phases.setup : state.phase === "ended" ? t.phases.ended : fill(t.phases[state.phase], { n: state.round });
  const nextLabel =
    state.phase === "setup" ? t.startGame : state.phase === "night" ? fill(t.toDay, { n: state.round }) : state.phase === "day" ? fill(t.toNight, { n: state.round + 1 }) : null;
  const tabs: Tab[] = state.phase === "night" ? ["night", "seat", "setup", "game"] : ["seat", "setup", "game"];
  // after "undo" out of a night the night tab is gone
  const shown = tabs.includes(tab) ? tab : "seat";

  return (
    <GrimoireContext.Provider value={context}>
      <div
        ref={root}
        className="grimoire flex h-[calc(100dvh-10rem)] min-h-[34rem] touch-manipulation flex-col gap-2 bg-background"
        data-testid="grimoire"
      >
        {state.drawing ? (
          <DrawView />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {!fullscreen && (
                <Link href="/admin/grimoary" className="text-sm text-muted hover:underline">
                  {t.back}
                </Link>
              )}
              <h1 className="min-w-0 truncate text-lg font-bold">{name}</h1>
              <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-sm font-semibold" data-testid="phase">
                {phaseLabel}
              </span>
              <span className={`text-xs ${statusClass[save.status]}`} role="status" data-testid="save-status">
                {canEdit ? t.saveStatus[save.status] : t.readOnly}
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "undo" })}
                    disabled={history.past.length === 0}
                    className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm font-medium disabled:opacity-40"
                  >
                    ↶ {t.undo}
                  </button>
                )}
                {canEdit && nextLabel && (
                  <button type="button" onClick={advance} className="min-h-11 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground">
                    {nextLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (fullscreen ? document.exitFullscreen() : root.current?.requestFullscreen())?.catch(() => {})}
                  className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm"
                  aria-label={fullscreen ? t.exitFullscreen : t.fullscreen}
                  title={fullscreen ? t.exitFullscreen : t.fullscreen}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    {fullscreen ? (
                      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                    ) : (
                      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                    )}
                  </svg>
                </button>
              </span>
            </div>

            {save.conflict && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm">
                <span className="flex-1">{t.conflict}</span>
                <button
                  type="button"
                  className="min-h-10 rounded-lg border border-border bg-card px-3"
                  onClick={() => {
                    const theirs = save.takeTheirs();
                    if (theirs) dispatch({ type: "replace", state: theirs });
                  }}
                >
                  {t.conflictTheirs}
                </button>
                <button type="button" className="min-h-10 rounded-lg bg-accent px-3 text-accent-foreground" onClick={save.keepMine}>
                  {t.conflictMine}
                </button>
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
              <div className="relative min-h-0 basis-[55%] lg:basis-auto lg:flex-1">
                <Town
                  selectedId={shown === "seat" ? selected : null}
                  highlightIds={focused?.seatIds ?? []}
                  onSelect={(seatId) => {
                    setSelected(seatId);
                    setTab("seat");
                  }}
                  onMove={context.readOnly || state.seatsLocked ? undefined : moveTo}
                  center={<TownCenter phaseLabel={phaseLabel} />}
                />
                {!context.readOnly && state.seats.length > 1 && (
                  // the seating done, the circle is locked so a finger in the game does not move anybody
                  <button
                    type="button"
                    onClick={() => update((s) => ({ ...s, seatsLocked: !s.seatsLocked }))}
                    className={`absolute top-0 left-0 z-10 flex size-11 items-center justify-center rounded-full border bg-card text-lg shadow-sm ${state.seatsLocked ? "border-accent" : "border-border"}`}
                    aria-pressed={!!state.seatsLocked}
                    aria-label={state.seatsLocked ? t.unlockSeats : t.lockSeats}
                    title={state.seatsLocked ? t.unlockSeats : t.lockSeats}
                    data-testid="seats-lock"
                  >
                    {state.seatsLocked ? "🔒" : "🔓"}
                  </button>
                )}
              </div>
              <aside className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card lg:w-[25rem] lg:flex-none">
                <div className="flex border-b border-border" role="tablist">
                  {tabs.map((x) => (
                    <button
                      key={x}
                      type="button"
                      role="tab"
                      aria-selected={shown === x}
                      onClick={() => setTab(x)}
                      className={`min-h-12 flex-1 px-2 text-sm font-semibold ${shown === x ? "border-b-2 border-accent text-accent" : "text-muted"}`}
                    >
                      {t.tabs[x]}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                  {shown === "seat" && <SeatPanel key={selected} seatId={selected} onRemoved={() => setSelected(null)} onSelect={setSelected} />}
                  {shown === "night" && (
                    <NightPanel steps={steps} currentId={currentStep?.id ?? null} focusId={focusStep} onFocus={setFocusStep} onNext={advance} />
                  )}
                  {shown === "setup" && (
                    <SetupPanel
                      scripts={scripts}
                      onSelectSeat={(seatId) => {
                        setSelected(seatId);
                        setTab("seat");
                      }}
                    />
                  )}
                  {shown === "game" && <GamePanel id={id} session={session} recorded={recorded} canEdit={canEdit} />}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </GrimoireContext.Provider>
  );
}
