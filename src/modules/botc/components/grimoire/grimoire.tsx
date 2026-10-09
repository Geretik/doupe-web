"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "@/i18n/dictionaries";
import type { GrimoireCharacter } from "@/modules/botc/lib/grimoire/characters";
import { isPlayer, nextPhase, nightSteps, putToken, type GrimoireSeat, type GrimoireState } from "@/modules/botc/lib/grimoire/state";
import { useAutosave, type SaveStatus } from "./autosave";
import { ChroniclePanel } from "./chronicle";
import { DrawView } from "./draw";
import { FabledAddPanel, FabledPanel, FabledTokens } from "./fabled";
import { fill } from "@/modules/botc/lib/grimoire/text";
import { GrimoireContext, nameOf, useGrimoire, type GrimoireContextValue, type GrimoireTexts } from "./context";
import { GameButton } from "./game-panel";
import { SCALE, useHidden, useTownScale } from "./device";
import { useOfflineCopy } from "./offline";
import { NightPanel, type Placing } from "./night-panel";
import { SeatPanel } from "./seat-panel";
import { SetupScreen, type ScriptChoice } from "./setup-panel";
import { ShowScreen } from "./show";
import type { ShowCard } from "@/modules/botc/lib/grimoire/show";
import { Town, TownCenter } from "./town";

const UNDO_LIMIT = 100;

/** `floor`: how many of the oldest steps "undo" cannot take back – the Storyteller's, while someone else holds the hidden grimoire */
type History = { present: GrimoireState; past: GrimoireState[]; floor: number };
type Change =
  | { type: "apply"; change: (s: GrimoireState) => GrimoireState }
  | { type: "undo" }
  | { type: "replace"; state: GrimoireState }
  | { type: "floor"; here: boolean };

function reducer(h: History, a: Change): History {
  if (a.type === "undo") return h.past.length > h.floor ? { ...h, present: h.past[h.past.length - 1], past: h.past.slice(0, -1) } : h;
  if (a.type === "replace") return { present: a.state, past: [], floor: 0 };
  if (a.type === "floor") return { ...h, floor: a.here ? h.past.length : 0 };
  const next = a.change(h.present);
  if (next === h.present) return h;
  const past = [...h.past, h.present].slice(-UNDO_LIMIT);
  // the oldest step dropped off the end lowers the floor with it
  return { present: next, past, floor: Math.max(0, h.floor - (h.past.length + 1 - past.length)) };
}

type Tab = "seat" | "night" | "log";

const statusClass: Record<SaveStatus, string> = {
  saved: "text-muted",
  pending: "text-muted",
  saving: "text-muted",
  offline: "font-semibold text-amber-600",
  outdated: "font-semibold text-accent",
  conflict: "font-semibold text-accent",
  invalid: "font-semibold text-accent",
};

/** The grimoire page: the town on the left (on top in portrait), the panel for the seat, the night, the setup and the game on the right. */
export function Grimoire({
  id,
  name,
  initial,
  canEdit,
  canDelete,
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
  canDelete: boolean;
  characters: Record<string, GrimoireCharacter>;
  scripts: ScriptChoice[];
  session: { id: number; title: string } | null;
  /** The session's signed-up players, for naming the seats */
  sessionPlayers: { id: number; nickname: string }[];
  recorded: boolean;
  locale: Locale;
  t: GrimoireTexts;
}) {
  const [history, dispatch] = useReducer(reducer, { present: initial.state, past: [], floor: 0 });
  const state = history.present;
  const [tab, setTab] = useState<Tab>(initial.state.phase === "night" ? "night" : "seat");
  const [setupOpen, setSetupOpen] = useState(false);
  // a new grimoire points at the setup until it is opened once
  const [setupSeen, setSetupSeen] = useState(false);
  const setupButton = useRef<HTMLButtonElement>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // a Fabled or Loric tapped in the town's corner, open in the panel instead of a player
  const [fabledOpen, setFabledOpen] = useState<string | null>(null);
  // the Fabled to add during the game, in the panel instead of a player
  const [addingFabled, setAddingFabled] = useState(false);
  // the players' draw started from the setup takes the screen; afterwards nobody is selected
  if (state.drawing && (setupOpen || selected)) {
    setSetupOpen(false);
    setSelected(null);
  }
  const [focusStep, setFocusStep] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(initiallyRecorded);
  const [fullscreen, setFullscreen] = useState(false);
  // a card shown to a player over the whole screen; not saved
  const [showing, setShowing] = useState<ShowCard | null>(null);

  const update = useCallback((change: (s: GrimoireState) => GrimoireState) => canEdit && dispatch({ type: "apply", change }), [canEdit]);
  const [hiddenHere, storeHidden] = useHidden(id);
  const [scale, setScale] = useTownScale();
  const hidden = canEdit && hiddenHere;
  const setHidden = (on: boolean) => {
    if (!on && !confirm(t.unhideConfirm)) return;
    storeHidden(on);
    // whoever holds the hidden grimoire takes back only their own changes
    dispatch({ type: "floor", here: on });
    if (on) {
      setPlacing(null);
      setFocusStep(null);
      setShowing(null);
    }
  };
  const save = useAutosave({
    id,
    state,
    version: initial.version,
    readOnly: !canEdit,
    onRestore: (restored) => dispatch({ type: "replace", state: restored }),
    onSaved: (r) => r.recorded && setRecorded(true),
  });

  // a grimoire to play opens again on this device without a connection
  useOfflineCopy(state, canEdit && state.phase !== "ended");

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

  // full screen: only the grimoire, without the site's header, menus and footer (a class on <html>, see globals.css),
  // and the browser's full screen where it has one (an iPhone has none: the grimoire still fills the window)
  useEffect(() => {
    if (!fullscreen) return;
    const html = document.documentElement;
    html.classList.add("grimoire-focus");
    window.scrollTo(0, 0);
    // leaving the browser's full screen (Esc, a swipe) leaves the grimoire's too
    const change = () => !document.fullscreenElement && setFullscreen(false);
    document.addEventListener("fullscreenchange", change);
    return () => {
      html.classList.remove("grimoire-focus");
      document.removeEventListener("fullscreenchange", change);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [fullscreen]);
  const toggleFullscreen = () => {
    if (!fullscreen) document.documentElement.requestFullscreen?.().catch(() => {});
    setFullscreen(!fullscreen);
  };

  // before the game, once characters are handed out, the first night to prepare the information characters' tokens
  const preview = state.phase === "setup" && state.seats.some((s) => s.role);
  const steps = useMemo(
    () => (state.phase === "night" ? nightSteps(state, characters, state.round === 1) : preview ? nightSteps(state, characters, true) : []),
    [state, characters, preview],
  );
  const currentStep = state.phase === "night" ? (steps.find((s) => !state.nightDone.includes(s.id)) ?? null) : null;
  const focused = steps.find((s) => s.id === focusStep) ?? currentStep;

  const context: GrimoireContextValue = {
    state,
    update,
    readOnly: !canEdit || state.phase === "ended",
    hidden,
    setHidden,
    scale,
    show: setShowing,
    characters,
    sessionPlayers,
    locale,
    t,
  };

  const advance = () => {
    const next = nextPhase(state, characters);
    update(() => next);
    setFocusStep(null);
    setPlacing(null);
    if (next.phase === "night") setTab("night");
    else if (tab === "night") setTab("seat");
  };
  const selectSeat = (seatId: string) => {
    setSelected(seatId);
    setFabledOpen(null);
    setAddingFabled(false);
    setTab("seat");
  };
  // a tap in the town: puts the token being placed there, else opens the player – or lets go of them when they are open
  const tapSeat = (seatId: string) => {
    const seat = state.seats.find((s) => s.id === seatId);
    if (placing && seat && isPlayer(seat)) {
      update((s) => putToken(s, seatId, placing.roleId, placing.text, characters));
      setPlacing(null);
      return;
    }
    if (seatId === selected && shown === "seat") setSelected(null);
    else selectSeat(seatId);
  };
  const moveSeats = (move: (seats: GrimoireSeat[]) => GrimoireSeat[]) =>
    update((s) => {
      const seats = move(s.seats);
      return seats === s.seats ? s : { ...s, seats };
    });
  const grid = state.layout === "grid";
  const phaseLabel =
    state.phase === "setup" ? t.phases.setup : state.phase === "ended" ? t.phases.ended : fill(t.phases[state.phase], { n: state.round });
  const nextLabel =
    state.phase === "setup" ? t.startGame : state.phase === "night" ? fill(t.toDay, { n: state.round }) : state.phase === "day" ? fill(t.toNight, { n: state.round + 1 }) : null;
  // the setup and the game's end are buttons under the panel: the setup is done once, the end comes once;
  // hidden, the night and the chronicle tell too much
  const tabs: Tab[] = hidden
    ? ["seat"]
    : [...(state.phase === "night" || preview ? ["night" as const] : []), "seat", ...(state.phase === "setup" ? [] : ["log" as const])];
  // after "undo" out of a night the night tab is gone
  const shown = tabs.includes(tab) ? tab : "seat";
  // taken out of the game (in the setup, by undo): the panel is the player's again
  const fabledShown = fabledOpen && state.fabled?.includes(fabledOpen) ? fabledOpen : null;
  const tapFabled = (id: string) => {
    setAddingFabled(false);
    if (id === fabledShown && shown === "seat") return setFabledOpen(null);
    setFabledOpen(id);
    setSelected(null);
    setTab("seat");
  };
  const addFabled = () => {
    setAddingFabled(true);
    setFabledOpen(null);
    setSelected(null);
    setTab("seat");
  };
  const setupHint = canEdit && !setupSeen && state.phase === "setup" && state.bag.length === 0 && !state.seats.some((s) => s.role);
  const openSetup = () => {
    setSetupOpen(true);
    setSetupSeen(true);
  };
  // on a phone the button is under the town, below the fold: brought into view
  useEffect(() => {
    if (setupHint) setupButton.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [setupHint]);

  return (
    <GrimoireContext.Provider value={context}>
      {/* the whole width of the window, not the admin's column under the header: the town and the panel get the room
          (the admin's column is centred on the window, so is this) */}
      <div
        className={`grimoire relative left-1/2 flex min-h-[34rem] w-[calc(100vw-2rem)] -translate-x-1/2 touch-manipulation flex-col gap-2 bg-background ${
          fullscreen ? "h-[calc(100dvh-1.5rem)]" : "h-[calc(100dvh-10rem)]"
        }`}
        data-testid="grimoire"
      >
        {state.drawing ? (
          <DrawView />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {!fullscreen && (
                <Link href="/admin/botc/grimoary" className="text-sm text-muted hover:underline">
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
              {canEdit && save.status === "outdated" && (
                // what is not saved is kept in this browser and comes back after the reload
                <button type="button" onClick={() => location.reload()} className="min-h-11 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground">
                  {t.reload}
                </button>
              )}
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "undo" })}
                    disabled={history.past.length <= history.floor}
                    className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm font-medium disabled:opacity-40"
                  >
                    ↶ {t.undo}
                  </button>
                )}
                {canEdit && nextLabel && !hidden && (
                  <button type="button" onClick={advance} className="min-h-11 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground">
                    {nextLabel}
                  </button>
                )}
                <ScaleButton scale={scale} onChange={setScale} />
                {canEdit && <HideButton />}
                <button
                  type="button"
                  onClick={toggleFullscreen}
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
                  selectedId={shown === "seat" && !fabledShown ? selected : null}
                  highlightIds={hidden ? [] : (focused?.seatIds ?? [])}
                  onSelect={tapSeat}
                  onBackground={() => (placing ? setPlacing(null) : (setSelected(null), setFabledOpen(null), setAddingFabled(false)))}
                  onMove={context.readOnly || state.seatsLocked ? undefined : moveSeats}
                  center={<TownCenter phaseLabel={phaseLabel} />}
                  hideRoles={hidden}
                />
                <FabledTokens
                  selectedId={shown === "seat" ? fabledShown : null}
                  onSelect={tapFabled}
                  onAdd={!context.readOnly && (state.phase === "night" || state.phase === "day") ? addFabled : undefined}
                />
                {placing && (
                  <div className="absolute inset-x-0 top-0 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-full border border-accent bg-card px-3 py-1.5 text-sm shadow-md" data-testid="placing">
                    <span>{fill(t.placeHint, { token: placing.text, role: nameOf(placing.roleId, locale) })}</span>
                    <button type="button" onClick={() => setPlacing(null)} className="min-h-9 rounded-full border border-border px-3 text-xs">
                      {t.cancel}
                    </button>
                  </div>
                )}
                {!context.readOnly && state.seats.length > 1 && (
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
                            : Array.from({ length: 8 }, (_, i) => (
                                <circle key={i} cx={12 + 8 * Math.cos((i * Math.PI) / 4)} cy={12 + 8 * Math.sin((i * Math.PI) / 4)} r={2.2} />
                              ))}
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <aside className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card lg:w-[25rem] lg:flex-none">
                <div className={`border-b border-border ${tabs.length > 1 ? "flex" : "hidden"}`} role="tablist">
                  {tabs.map((x) => (
                    <button
                      key={x}
                      type="button"
                      role="tab"
                      aria-selected={shown === x}
                      onClick={() => setTab(x)}
                      className={`min-h-12 flex-1 px-2 text-sm font-semibold ${shown === x ? "border-b-2 border-accent text-accent" : "text-muted"}`}
                    >
                      {x === "night" && preview ? t.tabs.prep : t.tabs[x]}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                  {shown === "seat" &&
                    (addingFabled ? (
                      <FabledAddPanel
                        onAdded={(id) => {
                          setAddingFabled(false);
                          setFabledOpen(id);
                        }}
                        onClose={() => setAddingFabled(false)}
                      />
                    ) : fabledShown ? (
                      <FabledPanel key={fabledShown} roleId={fabledShown} placing={placing} onPlace={setPlacing} onClose={() => setFabledOpen(null)} />
                    ) : (
                      <SeatPanel key={selected} seatId={selected} onRemoved={() => setSelected(null)} onSelect={setSelected} onClose={() => setSelected(null)} />
                    ))}
                  {shown === "log" && <ChroniclePanel />}
                  {shown === "night" && (
                    <NightPanel
                      steps={steps}
                      currentId={currentStep?.id ?? null}
                      focusId={focusStep}
                      onFocus={setFocusStep}
                      onNext={advance}
                      preview={preview}
                      placing={placing}
                      onPlace={setPlacing}
                    />
                  )}
                </div>
                <div className="relative grid grid-cols-2 gap-2 border-t border-border p-2">
                  {setupHint && (
                    <div className="pointer-events-none absolute bottom-full left-2 z-10 mb-1 flex flex-col items-start motion-safe:animate-bounce" data-testid="setup-hint">
                      <span className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground shadow-md">{t.setupHint}</span>
                      <span className="ml-8 border-x-8 border-t-8 border-x-transparent border-t-accent" aria-hidden />
                    </div>
                  )}
                  <button
                    ref={setupButton}
                    type="button"
                    onClick={openSetup}
                    className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${
                      state.phase === "setup" && canEdit ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card hover:border-accent/50"
                    } ${setupHint ? "ring-4 ring-accent/40 motion-safe:animate-pulse" : ""}`}
                    data-testid="setup-button"
                  >
                    ⚙️ {t.tabs.setup}
                  </button>
                  {hidden ? (
                    <HideButton wide />
                  ) : (
                    <GameButton id={id} session={session} recorded={recorded} canEdit={canEdit} canDelete={canDelete} />
                  )}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
      {setupOpen &&
        // over the whole screen: the grimoire is transformed, which would trap a fixed box inside it
        createPortal(
          <SetupScreen
            scripts={scripts}
            onSelectSeat={(seatId) => {
              selectSeat(seatId);
              setSetupOpen(false);
            }}
            onStart={
              canEdit && state.phase === "setup" && !hidden
                ? () => {
                    setSetupOpen(false);
                    advance();
                  }
                : undefined
            }
            onClose={() => setSetupOpen(false)}
          />,
          document.body,
        )}
      {showing && <ShowScreen card={showing} onChange={setShowing} onClose={() => setShowing(null)} />}
    </GrimoireContext.Provider>
  );
}

/**
 * 👁 / 🙈: hides the characters, reminders, the bag and the bluffs on this device, so someone else can help with the
 * grimoire without seeing the game; showing them again asks first. `wide`: as the button under the panel.
 */
export function HideButton({ wide = false }: { wide?: boolean }) {
  const { hidden, setHidden, t } = useGrimoire();
  const label = hidden ? t.unhide : t.hide;
  return (
    <button
      type="button"
      onClick={() => setHidden(!hidden)}
      className={`min-h-11 rounded-lg border bg-card px-3 text-sm ${hidden ? "border-accent font-semibold text-accent" : "border-border"} ${wide ? "w-full" : ""}`}
      aria-pressed={hidden}
      aria-label={label}
      title={label}
      data-testid={wide ? undefined : "hide-button"}
    >
      {hidden ? "🙈" : "👁"}
      {wide && ` ${t.unhideShort}`}
    </button>
  );
}

/** 🔍: how big the town's tokens, names and reminders are on this device, on a slider; back to 100 % in one tap. */
function ScaleButton({ scale, onChange }: { scale: number; onChange: (scale: number) => void }) {
  const { t } = useGrimoire();
  const [open, setOpen] = useState(false);
  const percent = Math.round(scale * 100);
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`min-h-11 rounded-lg border bg-card px-3 text-sm ${scale === 1 ? "border-border" : "border-accent"}`}
        aria-expanded={open}
        aria-label={t.scale}
        title={t.scale}
        data-testid="scale-button"
      >
        🔍{scale !== 1 && ` ${percent} %`}
      </button>
      {open && (
        <>
          {/* a tap anywhere else closes it */}
          <span className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute top-full right-0 z-40 mt-1 flex w-64 flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-lg" data-testid="scale-panel">
            <label htmlFor="grimoire-scale" className="flex justify-between text-sm font-semibold">
              {t.scale}
              <span>{percent} %</span>
            </label>
            <input
              id="grimoire-scale"
              type="range"
              min={SCALE.min * 100}
              max={SCALE.max * 100}
              step={SCALE.step * 100}
              value={percent}
              onChange={(e) => onChange(Number(e.target.value) / 100)}
              className="w-full accent-accent"
            />
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs text-muted">{t.scaleHint}</span>
              <button type="button" onClick={() => onChange(1)} disabled={scale === 1} className="min-h-10 rounded-lg border border-border px-3 text-sm disabled:opacity-40">
                100 %
              </button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}
