"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { readGrimoireScriptAction } from "@/app/actions/grimoire";
import { BLUFF_COUNT, botcRoles, findRole, linkedRoleOf, type RoleTeam } from "@/lib/botc-roles";
import {
  bluffCandidates,
  dealBag,
  distribution,
  gapKinds,
  isPlayer,
  MAX_SEATS,
  newGap,
  newSeat,
  playerSeats,
  setupNote,
  setupTeams,
  startDrawing,
  teamCounts,
  undrawable,
  type GrimoireState,
} from "@/lib/grimoire/state";
import { groupHeadingClass } from "@/components/draft/team-section";
import { fill } from "@/lib/grimoire/text";
import { nameOf, RoleIcon, useGrimoire, type GrimoireContextValue } from "./context";
import { RoleGrid, teamBox } from "./role-grid";
import { holders } from "./seat-panel";
import { gapIcon } from "./town";

export type ScriptChoice = { id: number; name: string; roleIds: string[] };

/** Characters in the bag or at the table that change the setup, with their note ("[+2 Outsiders]"). */
function setupChangesOf(state: GrimoireState, characters: GrimoireContextValue["characters"]) {
  return [...new Set([...state.bag, ...state.seats.map((s) => s.role)])].flatMap((id) => {
    const note = id && characters[id]?.setup ? setupNote(characters[id].ability) : null;
    return id && note ? [{ id, note }] : [];
  });
}

const allCharacterIds = botcRoles.filter((r) => r.team !== "traveller").map((r) => r.id);
const button = "min-h-11 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-40";
const plain = `${button} border-border bg-card hover:border-accent/50`;
const heading = "text-xs font-semibold tracking-wide text-muted uppercase";

/** Before the game (and for changes during it): script, players, the setup counts, the bag, the Demon's bluffs. */
export function SetupPanel({ scripts, onSelectSeat }: { scripts: ScriptChoice[]; onSelectSeat: (seatId: string) => void }) {
  const { state, update, readOnly, characters, locale, t } = useGrimoire();
  const [newName, setNewName] = useState("");
  const [bluffSlot, setBluffSlot] = useState<number | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const players = playerSeats(state).length;
  const inCircle = state.seats.filter(isPlayer);
  const expected = distribution(players);
  const assigned = teamCounts(state.seats.map((s) => s.role));
  const inBag = teamCounts(state.bag);
  const setupChanges = setupChangesOf(state, characters);
  const missingLinked = state.seats.filter((s) => linkedRoleOf(s.role) && !s.believedRole);

  const addPlayer = () => {
    const name = newName.trim().slice(0, 60);
    if (!name || state.seats.length >= MAX_SEATS) return;
    update((s) => ({ ...s, seats: [...s.seats, newSeat(name)] }));
    setNewName("");
  };
  const emptySeat = [...inCircle].reverse().find((x) => !x.name && !x.role && !x.registrationId);
  const setBluff = (slot: number, roleId: string | null) => {
    update((s) => ({ ...s, bluffs: s.bluffs.map((b, i) => (i === slot ? roleId : b)) }));
    setBluffSlot(null);
  };

  return (
    <div className="flex flex-col gap-5" data-testid="setup-panel">
      <ScriptPicker scripts={scripts} />

      <section className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={heading}>{fill(t.players, { n: inCircle.length })}</h3>
          {!readOnly && (
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
        <ol className="flex flex-wrap gap-1.5">
          {state.seats.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelectSeat(s.id)}
                className={`flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm hover:border-accent/50 ${s.gap ? "border-dashed border-muted/60 text-muted" : "border-border bg-card"}`}
              >
                {s.gap ? (
                  <>
                    {gapIcon[s.gap]} {t.gaps[s.gap]}
                  </>
                ) : (
                  <>
                    <span className="text-xs text-muted">{inCircle.indexOf(s) + 1}.</span>
                    {s.role && <RoleIcon roleId={s.role} size={22} />}
                    {s.name || "?"}
                  </>
                )}
              </button>
            </li>
          ))}
        </ol>
        {!readOnly && state.seats.length < MAX_SEATS && (
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
        )}
        {!readOnly && state.seats.length < MAX_SEATS && (
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
        )}
        <p className="text-xs text-muted">{t.seatOrderHint}</p>
      </section>

      <section className="flex flex-col gap-1.5" data-testid="distribution">
        <h3 className={heading}>{expected ? fill(t.distribution, { n: players }) : t.distributionTooFew}</h3>
        <table className="text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="text-left font-normal" />
              <th className="font-normal">{t.expected}</th>
              <th className="font-normal">{t.inBag}</th>
              <th className="font-normal">{t.assigned}</th>
            </tr>
          </thead>
          <tbody>
            {[...setupTeams, "traveller" as const].map((team) => {
              const want = team === "traveller" ? null : (expected?.[team] ?? null);
              const off = (n: number) => (want !== null && n !== want ? "font-bold text-accent" : "");
              if (team === "traveller" && assigned.traveller === 0) return null;
              return (
                <tr key={team}>
                  <td className={`py-0.5 font-medium ${groupHeadingClass(team)}`}>{t.teams[team]}</td>
                  <td className="text-center">{want ?? "–"}</td>
                  <td className={`text-center ${state.bag.length ? off(inBag[team]) : ""}`}>{team === "traveller" ? "–" : inBag[team]}</td>
                  <td className={`text-center ${off(assigned[team])}`}>{assigned[team]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {setupChanges.length > 0 && (
          <ul className="text-sm">
            {setupChanges.map((c) => (
              <li key={c.id}>
                ⚠️ {nameOf(c.id, locale)}: {c.note}
              </li>
            ))}
          </ul>
        )}
        {missingLinked.map((s) => (
          <button key={s.id} type="button" onClick={() => onSelectSeat(s.id)} className="text-left text-sm text-accent underline">
            {fill(t.linkedNeeded, { name: s.name, role: nameOf(s.role, locale) })}
          </button>
        ))}
      </section>

      {!readOnly && (
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={heading}>{fill(t.bag, { n: state.bag.length, m: players })}</h3>
            <button type="button" className={`${plain} ml-auto flex items-center gap-1.5`} onClick={() => setBagOpen(true)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
              {t.bagFullscreen}
            </button>
          </div>
          <p className="text-xs text-muted">{t.bagHint}</p>
          <BagActions />
          {state.phase === "setup" && <p className="text-xs text-muted">{t.drawSetupHint}</p>}
          <BagGrid />
        </section>
      )}
      {bagOpen &&
        // over the whole screen like the draw: in full screen only the grimoire is shown, so the box goes there
        createPortal(<BagScreen onClose={() => setBagOpen(false)} />, document.fullscreenElement ?? document.body)}

      <section className="flex flex-col gap-2">
        <h3 className={heading}>{t.bluffsTitle}</h3>
        <p className="text-xs text-muted">{t.bluffsHint}</p>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: BLUFF_COUNT }, (_, i) => {
            const b = state.bluffs[i] ?? null;
            return (
              <button
                key={i}
                type="button"
                disabled={readOnly}
                onClick={() => setBluffSlot(bluffSlot === i ? null : i)}
                aria-expanded={bluffSlot === i}
                aria-label={`${t.bluffsTitle} ${i + 1}`}
                className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border p-1 text-center text-xs ${bluffSlot === i ? "border-accent" : "border-border"} bg-card`}
              >
                {b ? <RoleIcon roleId={b} size={36} /> : <span className="text-lg text-muted">+</span>}
                <span className="leading-tight">{b ? nameOf(b, locale) : t.bluffEmpty}</span>
              </button>
            );
          })}
        </div>
        {bluffSlot !== null && (
          <>
            {state.bluffs[bluffSlot] && (
              <button type="button" className={plain} onClick={() => setBluff(bluffSlot, null)}>
                {t.bluffClear}
              </button>
            )}
            <RoleGrid
              roleIds={bluffCandidates(state).filter((id) => !state.bluffs.includes(id))}
              marked={new Set()}
              label={t.bluffsTitle}
              onPick={(id) => setBluff(bluffSlot, id)}
            />
          </>
        )}
      </section>
    </div>
  );
}

/** Hands the bag out at random, lets the players draw from it, empties it; `onDealt` after a deal. */
function BagActions({ onDealt }: { onDealt?: () => void }) {
  const { state, update, locale, t } = useGrimoire();
  const players = playerSeats(state).length;
  const blocked = undrawable(state.bag);
  const ready = state.bag.length > 0 && state.bag.length === players;
  const deal = () => {
    if (state.seats.some((s) => s.role) && !confirm(t.dealConfirm)) return;
    update((s) => dealBag(s) ?? s);
    onDealt?.();
  };
  const startDraw = () => {
    if (playerSeats(state).some((x) => x.role) && !confirm(t.drawConfirm)) return;
    update(startDrawing);
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${button} border-accent bg-accent text-accent-foreground`} onClick={deal} disabled={!ready}>
          {t.deal}
        </button>
        {state.phase === "setup" && (
          <button type="button" className={`${button} border-accent text-accent`} onClick={startDraw} disabled={!ready || blocked.length > 0}>
            {t.draw}
          </button>
        )}
        <button type="button" className={plain} onClick={() => update((s) => ({ ...s, bag: [] }))} disabled={!state.bag.length}>
          {t.emptyBag}
        </button>
      </div>
      {blocked.length > 0 && <p className="text-sm text-accent">{fill(t.undrawable, { roles: blocked.map((id) => nameOf(id, locale)).join(", ") })}</p>}
    </>
  );
}

/** The script's characters to put in the bag, each team with how many are in it and how many the rules want. */
function BagGrid({ wide = false }: { wide?: boolean }) {
  const { state, update, t } = useGrimoire();
  const expected = distribution(playerSeats(state).length);
  const inBag = teamCounts(state.bag);
  const count = (team: RoleTeam) => {
    if (team === "traveller") return null;
    const want = expected?.[team] ?? null;
    const off = state.bag.length > 0 && want !== null && inBag[team] !== want;
    return (
      <span className={`text-sm tracking-normal ${off ? "font-bold text-accent" : "text-foreground"}`} title={`${t.inBag} / ${t.expected}`} data-testid="bag-team-count">
        {inBag[team]}
        {want !== null && ` / ${want}`}
      </span>
    );
  };
  return (
    <RoleGrid
      roleIds={state.script.roleIds.filter((id) => findRole(id)?.team !== "traveller")}
      marked={new Set(state.bag)}
      notes={holders(state)}
      teamNote={count}
      label={t.bagLabel}
      onPick={(id) => update((s) => ({ ...s, bag: s.bag.includes(id) ? s.bag.filter((x) => x !== id) : [...s.bag, id] }))}
      wide={wide}
    />
  );
}

/** The bag over the whole screen, so a script's characters fit on a tablet without scrolling. */
function BagScreen({ onClose }: { onClose: () => void }) {
  const { state, characters, locale, t } = useGrimoire();
  const players = playerSeats(state).length;
  const expected = distribution(players);
  const inBag = teamCounts(state.bag);
  const setupChanges = setupChangesOf(state, characters);
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
      aria-label={t.bagTitle}
      data-testid="bag-screen"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-lg font-bold">{fill(t.bag, { n: state.bag.length, m: players })}</h2>
        <span className="text-sm text-muted">{distribution(players) ? fill(t.distribution, { n: players }) : t.distributionTooFew}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <BagActions onDealt={onClose} />
          <button type="button" className={plain} onClick={onClose}>
            {t.bagDone}
          </button>
        </div>
      </div>
      {/* in the bag against the rules, big: what the Storyteller checks while filling it */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="bag-summary">
        {setupTeams.map((team) => {
          const want = expected?.[team] ?? null;
          const off = state.bag.length > 0 && want !== null && inBag[team] !== want;
          return (
            <div key={team} className={`flex items-baseline justify-between gap-2 rounded-xl border px-4 py-2 ${teamBox[team]}`} data-team={team}>
              <span className={`text-sm font-semibold tracking-wide uppercase ${groupHeadingClass(team)}`}>{t.teams[team]}</span>
              <span className={`text-2xl font-bold whitespace-nowrap ${off ? "text-accent" : ""}`} title={`${t.inBag} / ${t.expected}`} data-testid="bag-summary-count">
                {inBag[team]}
                {want !== null && <span className="text-lg font-semibold text-muted"> / {want}</span>}
              </span>
            </div>
          );
        })}
      </div>
      {setupChanges.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 text-sm">
          {setupChanges.map((c) => (
            <li key={c.id}>
              ⚠️ {nameOf(c.id, locale)}: {c.note}
            </li>
          ))}
        </ul>
      )}
      <BagGrid wide />
    </div>
  );
}

/** The script: one of the library, every character, or a JSON pasted or picked as a file (not saved anywhere else). */
function ScriptPicker({ scripts }: { scripts: ScriptChoice[] }) {
  const { state, update, readOnly, t } = useGrimoire();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [extras, setExtras] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const applyScript = (script: GrimoireState["script"]) => update((s) => ({ ...s, script, bag: s.bag.filter((id) => script.roleIds.includes(id)) }));
  const value = state.script.id !== null ? String(state.script.id) : state.script.json ? "json" : "";
  const read = (raw: string) =>
    startTransition(async () => {
      const result = await readGrimoireScriptAction(raw);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError(null);
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
