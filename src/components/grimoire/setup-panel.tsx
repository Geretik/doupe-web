"use client";

import { useState } from "react";
import { BLUFF_COUNT, botcRoles, findRole, linkedRoleOf } from "@/lib/botc-roles";
import {
  bluffCandidates,
  dealBag,
  distribution,
  MAX_SEATS,
  newSeat,
  playerSeats,
  setupNote,
  setupTeams,
  teamCounts,
} from "@/lib/grimoire/state";
import { groupHeadingClass } from "@/components/draft/team-section";
import { fill } from "@/lib/grimoire/text";
import { nameOf, RoleIcon, useGrimoire } from "./context";
import { RoleGrid } from "./role-grid";
import { holders } from "./seat-panel";

export type ScriptChoice = { id: number; name: string; roleIds: string[] };

const allCharacterIds = botcRoles.filter((r) => r.team !== "traveller").map((r) => r.id);
const button = "min-h-11 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-40";
const plain = `${button} border-border bg-card hover:border-accent/50`;
const heading = "text-xs font-semibold tracking-wide text-muted uppercase";

/** Before the game (and for changes during it): script, players, the setup counts, the bag, the Demon's bluffs. */
export function SetupPanel({ scripts, onSelectSeat }: { scripts: ScriptChoice[]; onSelectSeat: (seatId: string) => void }) {
  const { state, update, readOnly, characters, locale, t } = useGrimoire();
  const [newName, setNewName] = useState("");
  const [bluffSlot, setBluffSlot] = useState<number | null>(null);
  const players = playerSeats(state).length;
  const expected = distribution(players);
  const assigned = teamCounts(state.seats.map((s) => s.role));
  const inBag = teamCounts(state.bag);
  const bagSet = new Set(state.bag);
  const setupChanges = [...new Set([...state.bag, ...state.seats.map((s) => s.role)])].flatMap((id) => {
    const note = id && characters[id]?.setup ? setupNote(characters[id].ability) : null;
    return id && note ? [{ id, note }] : [];
  });
  const missingLinked = state.seats.filter((s) => linkedRoleOf(s.role) && !s.believedRole);

  const pickScript = (value: string) =>
    update((s) => {
      const picked = scripts.find((x) => String(x.id) === value);
      const script = picked ?? { id: null, name: t.allCharacters, roleIds: allCharacterIds };
      return { ...s, script, bag: s.bag.filter((id) => script.roleIds.includes(id)) };
    });
  const addPlayer = () => {
    const name = newName.trim().slice(0, 60);
    if (!name || state.seats.length >= MAX_SEATS) return;
    update((s) => ({ ...s, seats: [...s.seats, newSeat(name)] }));
    setNewName("");
  };
  const toggleBag = (id: string) => update((s) => ({ ...s, bag: s.bag.includes(id) ? s.bag.filter((x) => x !== id) : [...s.bag, id] }));
  const deal = () => {
    if (state.seats.some((s) => s.role) && !confirm(t.dealConfirm)) return;
    update((s) => dealBag(s) ?? s);
  };
  const setBluff = (slot: number, roleId: string | null) => {
    update((s) => ({ ...s, bluffs: s.bluffs.map((b, i) => (i === slot ? roleId : b)) }));
    setBluffSlot(null);
  };

  return (
    <div className="flex flex-col gap-5" data-testid="setup-panel">
      <section className="flex flex-col gap-1.5">
        <label htmlFor="grimoire-script" className={heading}>
          {t.script}
        </label>
        <select
          id="grimoire-script"
          value={state.script.id ?? ""}
          onChange={(e) => pickScript(e.target.value)}
          disabled={readOnly}
          className="min-h-11 rounded-lg border border-border bg-card px-3 text-base"
        >
          <option value="">{t.allCharacters}</option>
          {scripts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {state.script.id !== null && !scripts.some((s) => s.id === state.script.id) && <option value={state.script.id}>{state.script.name}</option>}
        </select>
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className={heading}>{fill(t.players, { n: state.seats.length })}</h3>
        <ol className="flex flex-wrap gap-1.5">
          {state.seats.map((s, i) => (
            <li key={s.id}>
              <button type="button" onClick={() => onSelectSeat(s.id)} className="flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm hover:border-accent/50">
                <span className="text-xs text-muted">{i + 1}.</span>
                {s.role && <RoleIcon roleId={s.role} size={22} />}
                {s.name}
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
          <h3 className={heading}>{fill(t.bag, { n: state.bag.length, m: players })}</h3>
          <p className="text-xs text-muted">{t.bagHint}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${button} border-accent bg-accent text-accent-foreground`} onClick={deal} disabled={!state.bag.length || state.bag.length !== players}>
              {t.deal}
            </button>
            <button type="button" className={plain} onClick={() => update((s) => ({ ...s, bag: [] }))} disabled={!state.bag.length}>
              {t.emptyBag}
            </button>
          </div>
          <RoleGrid
            roleIds={state.script.roleIds.filter((id) => findRole(id)?.team !== "traveller")}
            marked={bagSet}
            notes={holders(state)}
            label={t.bagLabel}
            onPick={toggleBag}
          />
        </section>
      )}

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

