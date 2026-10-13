"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { readGrimoireScriptAction } from "@/modules/botc/actions/grimoire";
import { BLUFF_COUNT, botcRoles, findRole, homebrewCollections, homebrewRoles, linkedRoleOf, type RoleEdition, type RoleTeam } from "@/modules/botc/lib/botc-roles";
import {
  bagTokens,
  bluffCandidates,
  canStart,
  dealBag,
  hasFabled,
  POPE,
  expectedSetup,
  gapKinds,
  hiddenInBag,
  isPlayer,
  lineUpTyphon,
  marionetteApart,
  MAX_SEATS,
  newGap,
  newSeat,
  offCount,
  playerSeats,
  players as playersOf,
  randomBag,
  randomBluffs,
  setupNote,
  setupRoles,
  setupTeams,
  startDrawing,
  tapBag,
  teamCounts,
  typhonInLine,
  undrawable,
  withoutRole,
  withScript,
  type ExpectedCount,
  type GrimoireSeat,
  type GrimoireState,
  type Side,
} from "@/modules/botc/lib/grimoire/state";
import { groupHeadingClass } from "@/modules/botc/components/draft/team-section";
import { youAreCard } from "@/modules/botc/lib/grimoire/show";
import { jinxesAmong } from "@/modules/botc/lib/grimoire/characters";
import { fill } from "@/modules/botc/lib/grimoire/text";
import { nameOf, RoleIcon, useGrimoire, type GrimoireContextValue, type GrimoireTexts } from "./context";
import { RoleGrid, teamBox } from "./role-grid";
import { FabledSetup } from "./fabled";
import { ShowButton } from "./show";
import { holders, nextUnnamed, SidePicker } from "./seat-panel";
import { gapIcon } from "./town";
import { HideButton } from "./grimoire";

/** A script of the club's library: its characters, and its Fabled and Loric */
export type ScriptChoice = GrimoireState["script"] & { id: number };

/** A team's number the setup wants: "5", "0–2" or "1 nebo 3" when characters leave a choice, "?" when any; null under 5 players. */
function wanted(e: ExpectedCount | undefined, t: GrimoireTexts) {
  if (!e) return null;
  const v = e.values;
  if (!v) return "?";
  if (v.length === 1) return String(v[0]);
  return v.every((x, i) => i === 0 || x === v[i - 1] + 1) ? `${v[0]}–${v[v.length - 1]}` : v.join(` ${t.or} `);
}

/** Characters changed the rulebook's number of the team */
function changed(e: ExpectedCount | undefined) {
  return !!e && e.by.length > 0 && (!e.values || e.values.length !== 1 || e.values[0] !== e.base);
}

/**
 * Characters in the bag or at the table that change the setup, with their note ("[+2 Outsiders]"), and the ones
 * in the bag that bring an extra token of the character the player will think they are (the Drunk's Townsfolk).
 */
function setupChangesOf(state: GrimoireState, characters: GrimoireContextValue["characters"], t: GrimoireTexts) {
  return [...new Set([...state.bag, ...state.seats.map((s) => s.role)])].flatMap((id) => {
    const setup = id && characters[id]?.setup ? setupNote(characters[id].ability) : null;
    const standIn = id && state.bag.includes(id) ? t.standIn[id as keyof GrimoireTexts["standIn"]] : undefined;
    const note = [setup, standIn].filter(Boolean).join(" ");
    return id && note ? [{ id, note }] : [];
  });
}

/** How many tokens the bag holds for the players: one each, and the extra ones of a Drunk, Lunatic or Marionette. */
function bagSize(state: GrimoireState) {
  return playerSeats(state).length + hiddenInBag(state.bag).length;
}

const allCharacterIds = botcRoles.filter((r) => r.team !== "traveller").map((r) => r.id);
const officialTravellers = botcRoles.filter((r) => r.team === "traveller");
const homebrewTravellers = homebrewRoles.filter((r) => r.team === "traveller");
const travellerEditions: RoleEdition[] = ["tb", "bmr", "snv", "carousel"];
/** The club's homebrew collections that have travellers */
const travellerCollections = homebrewCollections.filter((c) => homebrewTravellers.some((r) => r.collection === c.key));

/** Which travellers to offer: the script's, an edition's, all the official ones, the homebrew ones, one collection's, all. */
type TravellerSet = "script" | "official" | RoleEdition | "homebrew" | `c:${string}` | "all";

function travellersOf(set: TravellerSet, script: GrimoireState["script"]) {
  const all = [...officialTravellers, ...homebrewTravellers];
  const roles =
    set === "script"
      ? all.filter((r) => script.roleIds.includes(r.id))
      : set === "official"
        ? officialTravellers
        : set === "homebrew"
          ? homebrewTravellers
          : set === "all"
            ? all
            : set.startsWith("c:")
              ? homebrewTravellers.filter((r) => `c:${r.collection}` === set)
              : officialTravellers.filter((r) => r.edition === set);
  return roles.map((r) => r.id);
}
const button = "min-h-11 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-40";
const plain = `${button} border-border bg-card hover:border-accent/50`;
const heading = "text-xs font-semibold tracking-wide text-muted uppercase";
/** The button the setup points at next */
const pointed = `${button} border-accent bg-accent text-accent-foreground ring-4 ring-accent/40 motion-safe:animate-pulse`;

/** The bag is empty and 🎲 Naplnit náhodně can fill it: what the setup points at first. */
function fillFirst(state: GrimoireState) {
  return state.bag.length === 0 && playerSeats(state).length >= 5;
}

/** The bag holds a token for each player: it can be handed out. */
function bagReady(state: GrimoireState) {
  return state.bag.length > 0 && bagTokens(state.bag).length === playerSeats(state).length;
}

/** The bag is full but the Demon's bluffs are not all picked (while the script has more to pick): they are next. */
function bluffsMissing(state: GrimoireState) {
  return bagReady(state) && state.bluffs.filter(Boolean).length < BLUFF_COUNT && bluffCandidates(state).some((id) => !state.bluffs.includes(id));
}

/** The bag and the bluffs are ready and nobody has a character yet: handing them out is next. */
function dealDue(state: GrimoireState) {
  return state.phase === "setup" && bagReady(state) && !bluffsMissing(state) && !playerSeats(state).some((s) => s.role);
}

/**
 * The setup over the whole screen, opened from the grimoire's panel: needed before the game, hardly after.
 * Starting the game from here closes it.
 */
export function SetupScreen({
  scripts,
  onSelectSeat,
  onStart,
  onClose,
}: {
  scripts: ScriptChoice[];
  onSelectSeat: (seatId: string) => void;
  /** Starts the first night; only before the game */
  onStart?: () => void;
  onClose: () => void;
}) {
  const { state, readOnly, t } = useGrimoire();
  const [tokensOpen, setTokensOpen] = useState(false);
  const ready = canStart(state);
  const closeTokens = () => {
    setTokensOpen(false);
    // the bag and the bluffs ready: on to the dealing at the bottom, which lights up
    if (dealDue(state)) document.getElementById("grimoire-deal")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-background" role="dialog" aria-modal="true" aria-label={t.tabs.setup} data-testid="setup-screen">
      <div className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3 sm:px-8">
          <h2 className="text-lg font-bold">{t.tabs.setup}</h2>
          <span className="ml-auto flex flex-wrap gap-2">
            {!readOnly && <HideButton />}
            {onStart && (
              <button type="button" className={ready ? pointed : `${button} border-accent bg-accent text-accent-foreground`} onClick={onStart} disabled={!ready}>
                {t.startGame}
              </button>
            )}
            <button type="button" className={plain} onClick={onClose}>
              {t.bagDone}
            </button>
          </span>
          {onStart && !ready && <StartBlocked onSelectSeat={onSelectSeat} onTokens={() => setTokensOpen(true)} />}
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-8">
        <SetupPanel scripts={scripts} onSelectSeat={onSelectSeat} onTokens={() => setTokensOpen(true)} wide />
      </div>
      {tokensOpen &&
        // over the whole screen, outside the grimoire's transformed column
        createPortal(<BagScreen onClose={closeTokens} />, document.body)}
    </div>
  );
}

/**
 * Why the game cannot start yet: no players, or players without a character – a few of them to tap and give one;
 * an empty bag first, with the way into the token selection.
 */
function StartBlocked({ onSelectSeat, onTokens }: { onSelectSeat: (seatId: string) => void; onTokens: () => void }) {
  const { state, t } = useGrimoire();
  const missing = withoutRole(state);
  const text = "w-full text-sm font-medium text-accent";
  if (!missing.length) return <p className={text}>{t.startNoPlayers}</p>;
  if (missing.length === playersOf(state).length && fillFirst(state)) {
    const [before, after] = t.startFillFirst.split("{tokens}");
    return (
      <p className={text} data-testid="start-fill">
        {before}
        <button type="button" className="underline" onClick={onTokens}>
          {t.startFillTokens}
        </button>
        {after}
      </p>
    );
  }
  // nobody has one yet: they are dealt below, not one by one
  if (missing.length === playersOf(state).length) return <p className={text}>{t.startDealFirst}</p>;
  const [before, after] = t.startMissing.split("{names}");
  return (
    <p className={text} data-testid="start-missing">
      {before}
      {missing.map((s, i) => (
        <span key={s.id}>
          {i > 0 && ", "}
          <button type="button" className="underline" onClick={() => onSelectSeat(s.id)}>
            {s.name || "?"}
          </button>
        </span>
      ))}
      {after}
    </p>
  );
}

/** Before the game (and for changes during it): script, Fabled and Loric, players, the setup counts, the bag, the Demon's bluffs. */
export function SetupPanel({
  scripts,
  onSelectSeat,
  onTokens,
  wide = false,
}: {
  scripts: ScriptChoice[];
  onSelectSeat: (seatId: string) => void;
  /** Opens the token selection over the whole screen */
  onTokens: () => void;
  wide?: boolean;
}) {
  const { state, hidden, t } = useGrimoire();
  const players = playerSeats(state).length;
  // hidden: the rulebook's numbers, not the ones the characters in play change
  const expected = expectedSetup(players, hidden ? [] : setupRoles(state));
  const bagExpected = expectedSetup(players, setupRoles(state), true);
  const assigned = teamCounts(state.seats.map((s) => s.role));
  const inBag = teamCounts(state.bag);

  return (
    <div className="flex flex-col gap-5" data-testid="setup-panel">
      <ScriptPicker scripts={scripts} />
      <FabledSetup wide={wide} />

      <section className="flex flex-col gap-1.5">
        <PlayersHeading />
        <PlayerList onOpen={onSelectSeat} />
        <AddToCircle />
        <p className="text-xs text-muted">{t.setupPlayersHint}</p>
      </section>

      <section className="flex flex-col gap-1.5" data-testid="distribution">
        <h3 className={heading}>{expected ? fill(t.distribution, { n: players }) : t.distributionTooFew}</h3>
        <table className="text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="text-left font-normal" />
              <th className="font-normal">{t.expected}</th>
              {!hidden && <th className="font-normal">{t.inBag}</th>}
              {!hidden && <th className="font-normal">{t.assigned}</th>}
            </tr>
          </thead>
          <tbody>
            {[...setupTeams, "traveller" as const].map((team) => {
              const want = team === "traveller" ? undefined : expected?.[team];
              const off = (n: number, e = want) => (offCount(e, n) ? "font-bold text-accent" : "");
              if (team === "traveller" && (assigned.traveller === 0 || hidden)) return null;
              return (
                <tr key={team}>
                  <td className={`py-0.5 font-medium ${groupHeadingClass(team)}`}>{t.teams[team]}</td>
                  <td className="text-center" title={want?.values ? undefined : t.anyCount}>
                    {wanted(want, t) ?? "–"}
                  </td>
                  {!hidden && (
                    <td className={`text-center ${state.bag.length && team !== "traveller" ? off(inBag[team], bagExpected?.[team]) : ""}`}>{team === "traveller" ? "–" : inBag[team]}</td>
                  )}
                  {!hidden && <td className={`text-center ${off(assigned[team])}`}>{assigned[team]}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!hidden && <SetupWarnings onSelectSeat={onSelectSeat} />}
      </section>

      {hidden ? (
        <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted" data-testid="setup-hidden">
          {t.hiddenSetup}
        </p>
      ) : (
        <SetupSecrets wide={wide} onTokens={onTokens} />
      )}
    </div>
  );
}

/**
 * The seating in the grimoire's panel before the game, nobody tapped: players, travellers and gaps into the circle
 * of the grimoire itself, their names one after another. `guide`: a new grimoire's steps, the setup after the seating.
 */
export function SeatingSetup({ guide, onSelect }: { guide: boolean; onSelect: (seatId: string) => void }) {
  const { state, t } = useGrimoire();
  const first = nextUnnamed(state, -1);
  return (
    <div className="flex flex-col gap-3" data-testid="seating">
      {guide && (
        <ol className="list-inside list-decimal rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm" data-testid="seating-guide">
          {t.seatingGuide.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      <PlayersHeading />
      {first && (
        <button type="button" className={`${plain} self-start`} onClick={() => onSelect(first.id)}>
          {t.seatNameThem}
        </button>
      )}
      <AddToCircle />
      <p className="text-xs text-muted">{t.seatOrderHint}</p>
    </div>
  );
}

/** How many players are in the circle, − and + for empty places, and the names cleared for a new seating. */
function PlayersHeading() {
  const { state, update, readOnly, t } = useGrimoire();
  const inCircle = state.seats.filter(isPlayer);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h3 className={heading}>{fill(t.players, { n: inCircle.length })}</h3>
      {!readOnly && (
        <>
          <PlayerCountButtons />
          <button
            type="button"
            className={`${plain} ml-auto`}
            onClick={() => update((s) => ({ ...s, seats: s.seats.map((x) => (isPlayer(x) ? { ...x, name: "", registrationId: null } : x)) }))}
            disabled={!inCircle.some((x) => x.name || x.registrationId)}
          >
            {t.clearNames}
          </button>
        </>
      )}
    </div>
  );
}

/** Into the circle: a player by name, a traveller, a door, the Storyteller or an obstacle. */
function AddToCircle() {
  const { state, update, readOnly, t } = useGrimoire();
  const [newName, setNewName] = useState("");
  if (readOnly || state.seats.length >= MAX_SEATS) return null;
  const addPlayer = () => {
    const name = newName.trim().slice(0, 60);
    if (!name) return;
    update((s) => (s.seats.length >= MAX_SEATS ? s : { ...s, seats: [...s.seats, newSeat(name)] }));
    setNewName("");
  };
  return (
    <>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addPlayer();
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t.addPlayerPlaceholder}
          aria-label={t.addPlayerPlaceholder}
          maxLength={60}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-base"
        />
        <button type="submit" className={plain}>
          {t.addPlayer}
        </button>
      </form>
      <AddTraveller />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{t.addGap}:</span>
        {gapKinds.map((gap) => (
          <button
            key={gap}
            type="button"
            className={plain}
            onClick={() => update((s) => ({ ...s, seats: [...s.seats, newGap(gap)] }))}
            disabled={gap === "storyteller" && state.seats.some((s) => s.gap === "storyteller")}
          >
            {gapIcon[gap]} {t.gaps[gap]}
          </button>
        ))}
      </div>
    </>
  );
}

/** What the characters in the bag and at the table do to the setup, and what is still missing; only for the Storyteller's eyes. */
function SetupWarnings({ onSelectSeat }: { onSelectSeat: (seatId: string) => void }) {
  const { state, update, readOnly, characters, locale, t, scriptNames } = useGrimoire();
  const setupChanges = setupChangesOf(state, characters, t);
  const missingLinked = state.seats.filter((s) => linkedRoleOf(s.role) && !s.believedRole);
  return (
    <>
      {setupChanges.length > 0 && (
        <ul className="text-sm">
          {setupChanges.map((c) => (
            <li key={c.id}>
              ⚠️ {nameOf(c.id, locale, scriptNames)}: {c.note}
            </li>
          ))}
        </ul>
      )}
      {marionetteApart(state) && <p className="text-sm text-accent">{t.marionetteApart}</p>}
      {typhonInLine(state) === false && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-accent">{t.typhonApart}</p>
          {!readOnly && (
            <button type="button" className={plain} onClick={() => update((s) => lineUpTyphon(s))}>
              {t.typhonLineUp}
            </button>
          )}
        </div>
      )}
      <JinxWarnings />
      {missingLinked.map((s) => (
        <button key={s.id} type="button" onClick={() => onSelectSeat(s.id)} className="text-left text-sm text-accent underline">
          {fill(t.linkedNeeded, { name: s.name, role: nameOf(s.role, locale, scriptNames), what: t.linked[linkedRoleOf(s.role)!.kind] })}
        </button>
      ))}
    </>
  );
}

/**
 * The circle in the setup as a list: a place tapped opens in the grimoire (name, character, reminders), ✕ takes it
 * away – a player with a name or a character after asking. Who sits where is up to the grimoire's own circle.
 */
function PlayerList({ onOpen }: { onOpen: (seatId: string) => void }) {
  const { state, update, readOnly, hidden, ask, t } = useGrimoire();
  const inCircle = state.seats.filter(isPlayer);
  const remove = async (seat: GrimoireSeat) => {
    if (!seat.gap && (seat.name || seat.role) && !(await ask(fill(t.removeSeatConfirm, { name: seat.name || "?" }), t.removeSeat))) return;
    update((s) => ({ ...s, seats: s.seats.filter((x) => x.id !== seat.id) }));
  };
  return (
    <ol className="flex flex-wrap gap-1.5" data-testid="setup-players">
      {state.seats.map((s) => {
        const edge = s.gap ? "border-dashed border-muted/60 text-muted" : "border-border bg-card";
        const label = s.gap ? t.gaps[s.gap] : s.name || "?";
        return (
          <li key={s.id} className="flex">
            <button
              type="button"
              onClick={() => onOpen(s.id)}
              className={`flex min-h-10 items-center gap-1.5 border px-3 text-sm hover:border-accent/50 ${edge} ${readOnly ? "rounded-full" : "rounded-l-full"}`}
            >
              {s.gap ? (
                <span aria-hidden>{gapIcon[s.gap]}</span>
              ) : (
                <>
                  <span className="text-xs text-muted">{inCircle.indexOf(s) + 1}.</span>
                  {s.role && !hidden && <RoleIcon roleId={s.role} size={22} />}
                </>
              )}
              {label}
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={() => remove(s)}
                aria-label={`${t.remove}: ${label}`}
                title={t.remove}
                className={`flex min-h-10 items-center rounded-r-full border border-l-0 pr-3 pl-2 text-sm text-muted hover:border-accent/50 hover:text-accent ${edge}`}
              >
                ✕
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The bag, the Demon's bluffs and handing the characters out. */
function SetupSecrets({ wide, onTokens }: { wide: boolean; onTokens: () => void }) {
  const { state, readOnly, locale, t, scriptNames } = useGrimoire();
  const bluffsDue = !readOnly && bluffsMissing(state);
  return (
    <>
      {/* the tokens and bluffs only to look at: they are chosen in the token selection over the whole screen */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={heading}>{fill(t.bag, { n: state.bag.length, m: bagSize(state) })}</h3>
          {!readOnly && (
            <button type="button" className={`ml-auto ${fillFirst(state) || bluffsDue ? pointed : `${button} border-accent text-accent`}`} onClick={onTokens}>
              🎒 {t.tokenPick}
            </button>
          )}
        </div>
        <BagContents wide={wide} />
      </section>

      {/* the bluffs stand out: the Demon needs them on the first night */}
      <section className={`flex flex-col gap-2 rounded-xl border border-accent bg-accent/5 p-3 ${bluffsDue ? "ring-4 ring-accent/30" : ""}`} data-testid="setup-bluffs">
        <h3 className="text-xs font-semibold tracking-wide text-accent uppercase">{t.bluffsTitle}</h3>
        {state.bluffs.some(Boolean) ? (
          <ul className="flex flex-wrap gap-1.5" data-testid="bluffs-view">
            {state.bluffs.flatMap((b) =>
              b
                ? [
                    <li key={b} className="flex items-center gap-1.5 rounded-full border border-accent/50 bg-card py-0.5 pr-3 pl-1 text-sm font-semibold">
                      <RoleIcon roleId={b} size={32} />
                      {nameOf(b, locale, scriptNames)}
                    </li>,
                  ]
                : [],
            )}
          </ul>
        ) : (
          <p className={`text-sm ${bluffsDue ? "font-medium text-accent" : "text-muted"}`}>{t.bluffsNone}</p>
        )}
      </section>

      {!readOnly && (
        <section id="grimoire-deal" className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className={heading}>{t.dealTitle}</h3>
          <p className="text-xs text-muted">{t.bagHint}</p>
          <DealActions />
          <UndrawableWarning />
          {state.phase === "setup" && <p className="text-xs text-muted">{t.drawSetupHint}</p>}
        </section>
      )}
    </>
  );
}

/**
 * A traveller joins: their name, good or evil (hidden, the Storyteller chooses it later in the player's panel), then
 * the character, the script's travellers marked; they sit down at the end of the circle. The traveller can also
 * choose the character themselves over the whole screen, without seeing the side.
 */
function AddTraveller() {
  const { state, update, hidden, t } = useGrimoire();
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [name, setName] = useState("");
  const [side, setSide] = useState<Side | undefined>();
  // the script's travellers when it has some, else the official ones
  const [set, setSet] = useState<TravellerSet>(() => (travellersOf("script", state.script).length ? "script" : "official"));
  const travellers = travellersOf(set, state.script);
  const inScript = new Map(state.script.roleIds.filter((id) => travellers.includes(id)).map((id) => [id, t.travellerInScript]));
  const add = (role: string) => {
    const traveller = { ...newSeat(name.trim().slice(0, 60)), role, ...(side && !hidden ? { side } : {}) };
    update((s) => (s.seats.length >= MAX_SEATS ? s : { ...s, seats: [...s.seats, traveller] }));
    setName("");
    setSide(undefined);
    setOpen(false);
    setChoosing(false);
  };
  return (
    <>
      <button type="button" className={`${plain} self-start`} onClick={() => setOpen(!open)} aria-expanded={open}>
        🧳 {t.addTraveller}
      </button>
      {open && (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-2" data-testid="add-traveller">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.travellerName}
            aria-label={t.travellerName}
            maxLength={60}
            className="min-h-11 min-w-0 rounded-lg border border-border bg-card px-3 text-base"
          />
          {!hidden && <SidePicker value={side} onChange={setSide} />}
          <TravellerSetSelect value={set} onChange={setSet} />
          <button type="button" className={`${plain} self-start`} onClick={() => setChoosing(true)}>
            📱 {t.travellerScreen.open}
          </button>
          {choosing &&
            // over the whole screen, outside the grimoire's transformed column
            createPortal(
              <TravellerScreen travellers={travellers} set={set} onSet={setSet} onPick={add} onClose={() => setChoosing(false)} />,
              document.body,
            )}
          {/* the side first, so the town shows it from the start; hidden, the Storyteller chooses it later */}
          {hidden || side ? (
            <>
              <p className="text-xs text-muted">{t.travellerHint}</p>
              <RoleGrid roleIds={travellers} marked={new Set()} notes={holders(state)} badges={inScript} label={t.addTraveller} onPick={add} />
            </>
          ) : (
            <p className="text-sm text-muted">{t.travellerSideFirst}</p>
          )}
        </div>
      )}
    </>
  );
}

/**
 * The traveller chooses their character over the whole screen: the set's travellers nobody plays yet with their
 * abilities, no side anywhere; picked, then confirmed at the bottom. The Storyteller can change the set at the top.
 */
function TravellerScreen({
  travellers,
  set,
  onSet,
  onPick,
  onClose,
}: {
  travellers: string[];
  set: TravellerSet;
  onSet: (set: TravellerSet) => void;
  onPick: (roleId: string) => void;
  onClose: () => void;
}) {
  const { state, characters, locale, t, scriptNames } = useGrimoire();
  const collator = new Intl.Collator(locale);
  const shown = travellers
    .filter((id) => !state.seats.some((s) => s.role === id))
    .sort((a, b) => collator.compare(nameOf(a, locale, scriptNames), nameOf(b, locale, scriptNames)));
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true" aria-label={t.travellerScreen.title} data-testid="traveller-screen">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-8">
        <h2 className="text-xl font-bold">{t.travellerScreen.title}</h2>
        <span className="ml-auto">
          <TravellerSetSelect value={set} onChange={onSet} />
        </span>
        <button type="button" className={plain} onClick={onClose}>
          {t.travellerScreen.back}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          <p className="text-muted">{t.travellerScreen.hint}</p>
          {!shown.length && <p className="text-sm text-muted">{t.travellerScreen.none}</p>}
          <ul className="grid gap-2 md:grid-cols-2">
            {shown.map((id) => (
              <li key={id} className="flex">
                <button
                  type="button"
                  aria-pressed={picked === id}
                  onClick={() => setPicked(id)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left ${
                    picked === id ? "border-accent bg-accent/10 ring-2 ring-accent/40" : "border-border bg-card hover:border-accent/50"
                  }`}
                >
                  <RoleIcon roleId={id} size={64} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-lg font-bold">{nameOf(id, locale, scriptNames)}</span>
                    {characters[id] && <span className="text-sm leading-snug">{characters[id].ability}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-border px-4 py-3 sm:px-8">
        <button
          type="button"
          disabled={!picked}
          onClick={() => picked && onPick(picked)}
          className="min-h-14 w-full rounded-xl bg-accent px-6 text-lg font-semibold text-accent-foreground disabled:opacity-40"
        >
          {picked ? fill(t.travellerScreen.confirm, { role: nameOf(picked, locale, scriptNames) }) : t.travellerScreen.pickOne}
        </button>
      </div>
    </div>
  );
}

/** The set of travellers to offer, each with how many it has: the script's, an edition, the official, the homebrew ones, one collection, all. */
function TravellerSetSelect({ value, onChange }: { value: TravellerSet; onChange: (set: TravellerSet) => void }) {
  const { state, t } = useGrimoire();
  const option = (set: TravellerSet, label: string) => {
    const n = travellersOf(set, state.script).length;
    // the script's travellers only when it has some
    if (set === "script" && !n) return null;
    return (
      <option key={set} value={set}>
        {label} ({n})
      </option>
    );
  };
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      {t.travellerSets.label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TravellerSet)}
        className="min-h-11 min-w-0 rounded-lg border border-border bg-card px-2 text-base"
        data-testid="traveller-set"
      >
        {option("script", t.travellerSets.script)}
        {option("official", t.travellerSets.official)}
        {travellerEditions.map((e) => option(e, t.travellerSets[e]))}
        {option("homebrew", t.travellerSets.homebrew)}
        {travellerCollections.map((c) => option(`c:${c.key}`, `– ${c.name}`))}
        {option("all", t.travellerSets.all)}
      </select>
    </label>
  );
}

const chip = "flex items-center gap-1.5 rounded-full border border-border bg-card py-0.5 pr-2.5 pl-1 text-sm";

/** The tokens in the bag by team, each with how many are in it and how many the rules want; nothing to tap. */
function BagContents({ wide }: { wide: boolean }) {
  const { state, readOnly, locale, t, scriptNames } = useGrimoire();
  const expected = expectedSetup(playerSeats(state).length, setupRoles(state), true);
  const inBag = teamCounts(state.bag);
  if (!state.bag.length && !readOnly && fillFirst(state)) {
    return (
      <p className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm" data-testid="bag-fill-hint">
        {t.bagEmptyFill}
      </p>
    );
  }
  if (!state.bag.length) return <p className="text-sm text-muted">{t.bagEmpty}</p>;
  return (
    <div className={`grid gap-2 ${wide ? "sm:grid-cols-2" : ""}`} data-testid="bag-contents">
      {setupTeams.map((team) => {
        const want = expected?.[team];
        const off = offCount(want, inBag[team]);
        return (
          <div key={team} className={`rounded-xl border p-2 ${teamBox[team]}`} data-team={team}>
            <h4 className={`mb-1.5 flex items-baseline justify-between gap-2 px-1 text-xs font-semibold tracking-wide uppercase ${groupHeadingClass(team)}`}>
              {t.teams[team]}
              <span className={`text-sm tracking-normal ${off ? "font-bold text-accent" : "text-foreground"}`} title={`${t.inBag} / ${t.expected}`} data-testid="bag-team-count">
                {inBag[team]}
                {want && ` / ${wanted(want, t)}`}
              </span>
            </h4>
            <ul className="flex flex-wrap gap-1.5">
              {state.bag
                .filter((id) => findRole(id)?.team === team)
                .map((id, i) => (
                  // the Pope's duplicates twice
                  <li key={`${id}-${i}`} className={chip}>
                    <RoleIcon roleId={id} size={26} />
                    {nameOf(id, locale, scriptNames)}
                  </li>
                ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Handing the bag out: the players draw from it themselves, or it is dealt at random after a confirmation. */
function DealActions() {
  const { state, update, ask, characters, t } = useGrimoire();
  const first = playerSeats(state).find((s) => s.role);
  const blocked = undrawable(state.bag);
  const ready = bagReady(state);
  // the dealing is next: the players' draw lights up, or the random deal when they cannot draw
  const due = dealDue(state);
  const deal = async () => {
    if (!(await ask(state.seats.some((s) => s.role) ? t.dealConfirm : t.dealRandomConfirm, t.deal))) return;
    update((s) => dealBag(s) ?? s);
  };
  const startDraw = async () => {
    if (playerSeats(state).some((x) => x.role) && !(await ask(t.drawConfirm))) return;
    update(startDrawing);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {state.phase === "setup" && (
        <button
          type="button"
          className={due && !blocked.length ? pointed : `${button} border-accent bg-accent text-accent-foreground`}
          onClick={startDraw}
          disabled={!ready || blocked.length > 0}
        >
          {t.draw}
        </button>
      )}
      <button type="button" className={due && blocked.length ? pointed : `${button} border-accent text-accent`} onClick={deal} disabled={!ready}>
        {t.deal}
      </button>
      {/* dealt: each player shown their character in turn, "Next" round the table */}
      {first && <ShowButton card={youAreCard(state, first, characters)} label={t.show.roundTable} />}
    </div>
  );
}

/** In the token selection: a bag filled at random by the rules (again on every tap; undo brings the last one back), or emptied. */
function PickActions() {
  const { state, update, t } = useGrimoire();
  const [failed, setFailed] = useState(false);
  const fillAtRandom = () => {
    const bag = randomBag(state);
    setFailed(!bag);
    if (bag) update((s) => ({ ...s, bag }));
  };
  const point = fillFirst(state);
  return (
    <>
      <span className="relative">
        <button type="button" className={point ? pointed : plain} onClick={fillAtRandom} disabled={playerSeats(state).length < 5}>
          🎲 {t.randomBag}
        </button>
        {point && <PointBubble text={t.randomBagHint} testId="fill-hint" />}
      </span>
      <button type="button" className={plain} onClick={() => update((s) => ({ ...s, bag: [] }))} disabled={!state.bag.length}>
        {t.emptyBag}
      </button>
      {failed && <span className="text-sm text-accent">{t.randomBagFailed}</span>}
    </>
  );
}

/** A bubble under the button next to it in the token selection, over the counts; taps go through it. */
function PointBubble({ text, testId }: { text: string; testId: string }) {
  return (
    <span className="pointer-events-none absolute top-full right-0 z-10 mt-1 flex w-max flex-col items-end motion-safe:animate-bounce" data-testid={testId}>
      <span className="mr-6 border-x-8 border-b-8 border-x-transparent border-b-accent" aria-hidden />
      <span className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground shadow-md">{text}</span>
    </span>
  );
}

/** − and + for the number of players: + adds an empty place to the circle, − takes the last empty one away. */
function PlayerCountButtons() {
  const { state, update, t } = useGrimoire();
  const emptySeat = [...state.seats.filter(isPlayer)].reverse().find((x) => !x.name && !x.role && !x.registrationId);
  return (
    <>
      <button
        type="button"
        className={`${plain} w-11 px-0 text-lg`}
        aria-label={t.fewer}
        onClick={() => update((s) => ({ ...s, seats: s.seats.filter((x) => x.id !== emptySeat?.id) }))}
        disabled={!emptySeat}
      >
        −
      </button>
      <button
        type="button"
        className={`${plain} w-11 px-0 text-lg`}
        aria-label={t.more}
        onClick={() => update((s) => ({ ...s, seats: [...s.seats, newSeat("")] }))}
        disabled={state.seats.length >= MAX_SEATS}
      >
        +
      </button>
    </>
  );
}

/** The Demon's bluffs as three places to tap; the `selected` one is being chosen, the empty ones stand out when `due`. */
function BluffSlots({
  selected,
  onSelect,
  compact = false,
  due = false,
}: {
  selected: number | null;
  onSelect: (slot: number | null) => void;
  compact?: boolean;
  due?: boolean;
}) {
  const { state, readOnly, locale, t, scriptNames } = useGrimoire();
  return (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: BLUFF_COUNT }, (_, i) => {
        const b = state.bluffs[i] ?? null;
        return (
          <button
            key={i}
            type="button"
            disabled={readOnly}
            onClick={() => onSelect(selected === i ? null : i)}
            aria-expanded={selected === i}
            aria-label={`${t.bluffsTitle} ${i + 1}`}
            className={`flex items-center rounded-lg border bg-card text-xs ${
              selected === i ? "border-accent ring-2 ring-accent/40" : due && !b ? "border-dashed border-accent text-accent" : "border-border"
            } ${
              compact ? "min-h-11 min-w-0 gap-1 px-1 text-left" : "min-h-20 flex-col justify-center gap-1 p-1 text-center"
            }`}
          >
            {b ? (
              <RoleIcon roleId={b} size={compact ? 26 : 36} />
            ) : (
              <span className={`text-lg ${due ? "font-bold" : "text-muted"} ${compact ? "w-full text-center" : ""}`}>+</span>
            )}
            {(b || !compact) && <span className={`leading-tight ${compact ? "truncate" : ""}`}>{b ? nameOf(b, locale, scriptNames) : t.bluffEmpty}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Three random bluffs of the good characters not in play and not in the bag; `compact` shows only the die, `due` makes it stand out. */
function RandomBluffsButton({ onDone, compact = false, due = false }: { onDone: () => void; compact?: boolean; due?: boolean }) {
  const { state, update, t } = useGrimoire();
  return (
    <button
      type="button"
      className={`${due ? pointed : plain} ml-auto ${compact ? "min-h-9 w-11 px-0 py-1" : "min-h-9 py-1"}`}
      onClick={() => {
        update((s) => ({ ...s, bluffs: randomBluffs(s) }));
        onDone();
      }}
      disabled={bluffCandidates(state).length === 0}
      aria-label={`🎲 ${t.randomBluffs}`}
      title={t.randomBluffs}
    >
      {compact ? "🎲" : `🎲 ${t.randomBluffs}`}
    </button>
  );
}

/** The good characters to pick for a bluff place (none of the other bluffs), and taking the bluff away. */
function BluffChoices({ slot, onDone, wide = false }: { slot: number; onDone: () => void; wide?: boolean }) {
  const { state, update, t } = useGrimoire();
  const setBluff = (roleId: string | null) => {
    update((s) => ({ ...s, bluffs: s.bluffs.map((b, i) => (i === slot ? roleId : b)) }));
    onDone();
  };
  return (
    <div className="flex flex-col gap-2" data-testid="bluff-choices">
      <div className="flex flex-wrap items-center gap-2">
        {wide && <h3 className="text-lg font-semibold">{fill(t.bluffPick, { n: slot + 1 })}</h3>}
        {state.bluffs[slot] && (
          <button type="button" className={plain} onClick={() => setBluff(null)}>
            {t.bluffClear}
          </button>
        )}
        {wide && (
          <button type="button" className={`${plain} ml-auto`} onClick={onDone}>
            {t.bluffBack}
          </button>
        )}
      </div>
      <RoleGrid
        roleIds={bluffCandidates(state).filter((id) => !state.bluffs.includes(id))}
        marked={new Set()}
        label={t.bluffsTitle}
        onPick={(id) => setBluff(id)}
        wide={wide}
      />
    </div>
  );
}

/** Why the players cannot draw: a character in the bag they must not see (the Drunk…). */
function UndrawableWarning() {
  const { state, locale, t, scriptNames } = useGrimoire();
  const blocked = undrawable(state.bag);
  if (!blocked.length) return null;
  return <p className="text-sm text-accent">{fill(t.undrawable, { roles: blocked.map((id) => nameOf(id, locale, scriptNames)).join(", ") })}</p>;
}

/** Legion in the bag: most players are Legion, as many of its tokens as the Storyteller likes. */
function LegionCount() {
  const { state, update, t } = useGrimoire();
  const n = state.bag.filter((id) => id === "legion").length;
  if (!n) return null;
  const set = (k: number) => update((s) => ({ ...s, bag: [...s.bag.filter((id) => id !== "legion"), ...Array<string>(k).fill("legion")] }));
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="legion-count">
      <RoleIcon roleId="legion" size={28} />
      <span className="font-semibold">{fill(t.legionCount, { n })}</span>
      <button type="button" className={`${plain} w-11 px-0 text-lg`} aria-label={t.legionFewer} onClick={() => set(n - 1)} disabled={n <= 1}>
        −
      </button>
      <button type="button" className={`${plain} w-11 px-0 text-lg`} aria-label={t.legionMore} onClick={() => set(n + 1)} disabled={state.bag.length >= MAX_SEATS}>
        +
      </button>
      <span className="text-muted">{fill(t.legionHint, { n: Math.floor(playerSeats(state).length / 2) + 1 })}</span>
    </div>
  );
}

/** Characters in the bag (or at the table) with a jinx between them: how the two work together. */
function JinxWarnings() {
  const { state, characters, locale, t, scriptNames } = useGrimoire();
  const jinxes = jinxesAmong(setupRoles(state), characters);
  if (!jinxes.length) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-sm" data-testid="jinxes">
      <h4 className="font-semibold text-accent">⚠️ {t.jinxes}</h4>
      <ul className="flex flex-col gap-1">
        {jinxes.map(({ a, b, reason }) => (
          <li key={`${a}-${b}`} className="flex flex-wrap items-center gap-1.5">
            <RoleIcon roleId={a} size={22} />
            <RoleIcon roleId={b} size={22} />
            <span>
              <span className="font-semibold">
                {nameOf(a, locale, scriptNames)} + {nameOf(b, locale, scriptNames)}:
              </span>{" "}
              <span lang="en">{reason}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The script's characters to put in the bag, each team with how many are in it and how many the rules want. */
function BagGrid({ wide = false }: { wide?: boolean }) {
  const { state, update, characters, t } = useGrimoire();
  const expected = expectedSetup(playerSeats(state).length, setupRoles(state), true);
  const inBag = teamCounts(state.bag);
  const roleIds = state.script.roleIds.filter((id) => findRole(id)?.team !== "traveller");
  // what a character does to the setup, on its tile: "+2 Podivíni", "+1 Měšťan" for the Drunk's extra token; the Pope's duplicates "2×"
  const setupNotes = new Map(
    roleIds.flatMap((id) => {
      const standIn = t.standInBadge[id as keyof GrimoireTexts["standInBadge"]];
      const note = characters[id]?.setup ? setupNote(characters[id].ability) : null;
      const n = state.bag.filter((x) => x === id).length;
      const badge = [standIn ?? (note ? note.slice(1, -1).trim() : null), n > 1 && id !== "legion" ? fill(t.popeTwice, { n }) : null].filter(Boolean).join(" · ");
      return badge ? [[id, badge] as const] : [];
    }),
  );
  const count = (team: RoleTeam) => {
    if (team === "traveller") return null;
    const want = expected?.[team];
    const off = state.bag.length > 0 && offCount(want, inBag[team]);
    return (
      <span className={`text-sm tracking-normal ${off ? "font-bold text-accent" : "text-foreground"}`} title={`${t.inBag} / ${t.expected}`} data-testid="bag-team-count">
        {inBag[team]}
        {want && ` / ${wanted(want, t)}`}
      </span>
    );
  };
  return (
    <RoleGrid
      roleIds={roleIds}
      marked={new Set(state.bag)}
      notes={holders(state)}
      badges={setupNotes}
      teamNote={count}
      label={t.bagLabel}
      onPick={(id) => update((s) => tapBag(s, id))}
      wide={wide}
    />
  );
}

/** The bag over the whole screen, so a script's characters fit on a tablet without scrolling. */
function BagScreen({ onClose }: { onClose: () => void }) {
  const { state, characters, locale, t, scriptNames } = useGrimoire();
  const [bluffSlot, setBluffSlot] = useState<number | null>(null);
  const players = playerSeats(state).length;
  const expected = expectedSetup(players, setupRoles(state), true);
  const inBag = teamCounts(state.bag);
  const setupChanges = setupChangesOf(state, characters, t);
  const bluffsDue = bluffsMissing(state);
  const done = dealDue(state);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col gap-4 overflow-y-auto overscroll-contain bg-background px-4 py-4 sm:px-8 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-label={t.tokenPick}
      data-testid="bag-screen"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-lg font-bold">{fill(t.tokenPickCount, { n: state.bag.length, m: bagSize(state) })}</h2>
        <span className="flex items-center gap-2 text-sm text-muted">
          {expected ? fill(t.distribution, { n: players }) : t.distributionTooFew}
          <PlayerCountButtons />
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <PickActions />
          <span className="relative">
            <button type="button" className={done ? pointed : plain} onClick={onClose}>
              {t.bagDone}
            </button>
            {done && <PointBubble text={t.bagDoneHint} testId="done-hint" />}
          </span>
        </div>
      </div>
      {/* in the bag against the rules, big: what the Storyteller checks while filling it */}
      {/* the bluffs a little wider than a team: three characters side by side */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.5fr)]" data-testid="bag-summary">
        {setupTeams.map((team) => {
          const want = expected?.[team];
          const off = state.bag.length > 0 && offCount(want, inBag[team]);
          return (
            <div key={team} className={`flex flex-col rounded-xl border px-4 py-2 ${teamBox[team]}`} data-team={team}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-sm font-semibold tracking-wide uppercase ${groupHeadingClass(team)}`}>{t.teams[team]}</span>
                <span className={`text-2xl font-bold whitespace-nowrap ${off ? "text-accent" : ""}`} title={`${t.inBag} / ${t.expected}`} data-testid="bag-summary-count">
                  {inBag[team]}
                  {want && <span className="text-lg font-semibold text-muted"> / {wanted(want, t)}</span>}
                </span>
              </div>
              {want && changed(want) && (
                // who changed the rulebook's number
                <span className="text-xs text-muted" data-testid="bag-summary-by">
                  {want.by.map((id) => nameOf(id, locale, scriptNames)).join(", ")} · {fill(t.baseCount, { n: want.base })}
                </span>
              )}
            </div>
          );
        })}
        {/* the bluffs stand out, and once the bag is full they are next */}
        <div
          className={`col-span-2 flex flex-col gap-1.5 rounded-xl border border-accent bg-accent/5 px-3 py-2 lg:col-span-1 ${bluffsDue ? "ring-4 ring-accent/30" : ""}`}
          data-testid="bag-bluffs"
        >
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold tracking-wide text-accent uppercase">{t.bluffsTitle}</span>
            <RandomBluffsButton compact due={bluffsDue} onDone={() => setBluffSlot(null)} />
          </div>
          <BluffSlots compact due={bluffsDue} selected={bluffSlot} onSelect={setBluffSlot} />
        </div>
      </div>
      {setupChanges.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 text-sm">
          {setupChanges.map((c) => (
            <li key={c.id}>
              ⚠️ {nameOf(c.id, locale, scriptNames)}: {c.note}
            </li>
          ))}
        </ul>
      )}
      <UndrawableWarning />
      <JinxWarnings />
      <LegionCount />
      {hasFabled(state, POPE) && <p className="text-sm" data-testid="pope-hint">⚠️ {t.popeHint}</p>}
      {bluffSlot === null ? <BagGrid wide /> : <BluffChoices slot={bluffSlot} onDone={() => setBluffSlot(null)} wide />}
    </div>
  );
}

/** The script: one of the library, every character, or a JSON pasted or picked as a file (not saved anywhere else). */
function ScriptPicker({ scripts }: { scripts: ScriptChoice[] }) {
  const { state, update, readOnly, addCharacters, t } = useGrimoire();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [extras, setExtras] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const applyScript = (script: GrimoireState["script"]) => update((s) => withScript(s, script));
  const value = state.script.id !== null ? String(state.script.id) : state.script.json ? "json" : "";
  const read = (raw: string) =>
    startTransition(async () => {
      const result = await readGrimoireScriptAction(raw);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError(null);
      addCharacters(result.characters);
      setExtras(result.extras);
      setText("");
      setOpen(false);
      applyScript(result.script);
    });

  return (
    <section className="flex flex-col gap-1.5">
      <label htmlFor="grimoire-script" className={heading}>
        {t.script}
      </label>
      <select
        id="grimoire-script"
        value={value}
        onChange={(e) => {
          if (e.target.value === "json") return;
          const picked = scripts.find((x) => String(x.id) === e.target.value);
          setExtras([]);
          applyScript(picked ?? { id: null, name: t.allCharacters, roleIds: allCharacterIds });
        }}
        disabled={readOnly}
        className="min-h-11 rounded-lg border border-border bg-card px-3 text-base"
      >
        <option value="">{t.allCharacters}</option>
        {state.script.json && <option value="json">{fill(t.jsonOption, { name: state.script.name })}</option>}
        {scripts.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        {state.script.id !== null && !scripts.some((s) => s.id === state.script.id) && <option value={state.script.id}>{state.script.name}</option>}
      </select>
      {extras.length > 0 && <p className="text-xs text-muted">{fill(t.jsonExtras, { list: extras.join(", ") })}</p>}
      {!readOnly && (
        <button type="button" className={`${plain} self-start`} onClick={() => setOpen(!open)} aria-expanded={open}>
          {t.jsonOpen}
        </button>
      )}
      {open && (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-2">
          <p className="text-xs text-muted">{t.jsonHint}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            aria-label={t.jsonOpen}
            placeholder='[{"id": "_meta", "name": "…"}, "washerwoman", …]'
            className="rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={`${button} border-accent bg-accent text-accent-foreground`} onClick={() => read(text)} disabled={pending || !text.trim()}>
              {pending ? t.jsonLoading : t.jsonUse}
            </button>
            <label className="text-sm">
              <span className="sr-only">{t.jsonFile}</span>
              <input
                type="file"
                accept=".json,application/json"
                aria-label={t.jsonFile}
                className="max-w-full text-sm"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) read(await file.text());
                }}
              />
            </label>
          </div>
          {error && <p className="text-sm text-accent">{error}</p>}
        </div>
      )}
    </section>
  );
}
