"use client";

import { useState } from "react";
import { botcRoles, findRole, linkedRoleOf } from "@/lib/botc-roles";
import {
  charactersInPlay,
  gapKinds,
  MAX_REMINDERS,
  MAX_SEATS,
  moveSeat,
  newGap,
  uid,
  type GapKind,
  type GrimoireSeat,
  type GrimoireState,
} from "@/lib/grimoire/state";
import { fill } from "@/lib/grimoire/text";
import { nameOf, RoleIcon, useGrimoire } from "./context";
import { RoleGrid } from "./role-grid";
import { gapIcon } from "./town";

const travellers = botcRoles.filter((r) => r.team === "traveller").map((r) => r.id);

const big = "min-h-11 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-40";
const plain = `${big} border-border bg-card hover:border-accent/50`;

function changeSeat(s: GrimoireState, seatId: string, change: (seat: GrimoireSeat) => GrimoireSeat): GrimoireState {
  return { ...s, seats: s.seats.map((seat) => (seat.id === seatId ? change(seat) : seat)) };
}

/** Who has which character, for the notes in the character grid. */
export function holders(state: GrimoireState, exceptSeatId?: string) {
  const names = new Map<string, string>();
  for (const s of state.seats) {
    if (!s.role || s.id === exceptSeatId) continue;
    names.set(s.role, names.has(s.role) ? `${names.get(s.role)}, ${s.name}` : s.name);
  }
  return names;
}

/** Everything about the place tapped in the town: a player's name, character, death, vote, reminders, place; or a gap. */
export function SeatPanel({ seatId, onRemoved, onSelect }: { seatId: string | null; onRemoved: () => void; onSelect: (seatId: string) => void }) {
  const { state, update, readOnly, characters, sessionPlayers, locale, t } = useGrimoire();
  const index = state.seats.findIndex((s) => s.id === seatId);
  const seat = index >= 0 ? state.seats[index] : null;
  const [picking, setPicking] = useState<"role" | "linked" | "reminder" | null>(null);
  const [custom, setCustom] = useState("");
  if (!seat) return <p className="text-sm text-muted">{t.pickSeat}</p>;

  if (seat.gap) return <GapPanel seat={{ ...seat, gap: seat.gap }} index={index} onRemoved={onRemoved} />;

  const set = (change: (seat: GrimoireSeat) => GrimoireSeat) => update((s) => changeSeat(s, seat.id, change));
  const linked = linkedRoleOf(seat.role);
  const others = holders(state, seat.id);
  // a session player not seated elsewhere: typing their nickname links the seat to their sign-up
  const seatedElsewhere = new Set(state.seats.filter((x) => x.id !== seat.id).map((x) => x.registrationId));
  const free = sessionPlayers.filter((p) => !seatedElsewhere.has(p.id) && p.id !== seat.registrationId);
  const setName = (name: string) => {
    const match = sessionPlayers.find((p) => !seatedElsewhere.has(p.id) && p.nickname.toLowerCase() === name.toLowerCase());
    set((x) => ({ ...x, name, registrationId: match?.id ?? null }));
  };
  const pickPlayer = (player: { id: number; nickname: string }) => {
    set((x) => ({ ...x, name: player.nickname, registrationId: player.id }));
    // naming the circle after a draw: on to the next place without a name, clockwise
    const next = [...state.seats.slice(index + 1), ...state.seats.slice(0, index)].find((x) => !x.gap && !x.name);
    if (next) onSelect(next.id);
  };
  const addReminder = (roleId: string | null, text: string) => {
    set((x) => ({ ...x, reminders: [...x.reminders, { id: uid(), roleId, text }].slice(0, MAX_REMINDERS) }));
    setPicking(null);
  };

  return (
    <div className="flex flex-col gap-4" data-testid="seat-panel">
      <SeatName key={`${seat.id}-${seat.name}`} name={seat.name} onSave={setName} />
      {seat.registrationId && <p className="-mt-3 text-xs text-muted">✓ {t.linkedToSession}</p>}
      {!readOnly && free.length > 0 && (
        <section className="-mt-1 flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{t.fromSession}</h3>
          <div className="flex flex-wrap gap-1.5">
            {free.map((p) => (
              <button key={p.id} type="button" onClick={() => pickPlayer(p)} className="min-h-10 rounded-full border border-border bg-card px-3 text-sm hover:border-accent/50">
                {p.nickname}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{t.role}</h3>
        <div className="flex items-center gap-3">
          {seat.role ? <RoleIcon roleId={seat.role} size={48} /> : <span className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-border text-muted">?</span>}
          <span className="flex-1 text-lg font-semibold">{seat.role ? nameOf(seat.role, locale) : t.noRole}</span>
          {!readOnly && (
            <button type="button" className={plain} onClick={() => setPicking(picking === "role" ? null : "role")} aria-expanded={picking === "role"}>
              {t.changeRole}
            </button>
          )}
        </div>
        {seat.role && characters[seat.role] && <p className="text-sm leading-snug text-muted">{characters[seat.role].ability}</p>}
        {picking === "role" && (
          <>
            {seat.role && (
              <button type="button" className={plain} onClick={() => (set((x) => ({ ...x, role: null, believedRole: null })), setPicking(null))}>
                {t.noRoleOption}
              </button>
            )}
            <RoleGrid
              roleIds={[...state.script.roleIds, ...travellers.filter((id) => !state.script.roleIds.includes(id))]}
              marked={new Set(seat.role ? [seat.role] : [])}
              notes={others}
              label={t.role}
              onPick={(role) => {
                set((x) => ({ ...x, role, believedRole: role === x.role ? x.believedRole : null }));
                setPicking(null);
              }}
            />
          </>
        )}
      </section>

      {linked && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{t.linked[linked.kind]}</h3>
          <div className="flex items-center gap-3">
            {seat.believedRole ? <RoleIcon roleId={seat.believedRole} size={40} /> : <span className="text-sm text-accent">{t.linkedMissing}</span>}
            <span className="flex-1 font-semibold">{seat.believedRole && nameOf(seat.believedRole, locale)}</span>
            {!readOnly && (
              <button type="button" className={plain} onClick={() => setPicking(picking === "linked" ? null : "linked")} aria-expanded={picking === "linked"}>
                {t.pick}
              </button>
            )}
          </div>
          {seat.believedRole && characters[seat.believedRole] && (
            <p className="text-sm leading-snug text-muted">{characters[seat.believedRole].ability}</p>
          )}
          {picking === "linked" && (
            <RoleGrid
              roleIds={state.script.roleIds.filter((id) => id !== seat.role && linked.teams.some((team) => findRole(id)?.team === team))}
              marked={new Set(seat.believedRole ? [seat.believedRole] : [])}
              notes={others}
              label={t.linked[linked.kind]}
              onPick={(believedRole) => {
                set((x) => ({ ...x, believedRole }));
                setPicking(null);
              }}
            />
          )}
        </section>
      )}

      {!readOnly && (
        <section className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`${big} ${seat.dead ? "border-border bg-card" : "border-accent bg-accent text-accent-foreground"}`}
            onClick={() => set((x) => ({ ...x, dead: !x.dead, voteUsed: false }))}
          >
            {seat.dead ? t.revive : t.kill}
          </button>
          {seat.dead && (
            <button type="button" className={plain} onClick={() => set((x) => ({ ...x, voteUsed: !x.voteUsed }))} aria-pressed={seat.voteUsed}>
              {seat.voteUsed ? t.voteBack : t.voteSpend}
            </button>
          )}
        </section>
      )}
      {seat.dead && <p className="-mt-2 text-sm text-muted">{seat.voteUsed ? t.voteUsed : t.ghostVote}</p>}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{t.reminders}</h3>
        {seat.reminders.length === 0 && <p className="text-sm text-muted">{t.noReminders}</p>}
        <ul className="flex flex-wrap gap-1.5">
          {seat.reminders.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => set((x) => ({ ...x, reminders: x.reminders.filter((y) => y.id !== r.id) }))}
                className="flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-sm hover:border-accent/50"
                aria-label={`${t.remove}: ${r.text}`}
              >
                {r.roleId ? <RoleIcon roleId={r.roleId} size={28} /> : <span className="w-1" />}
                {r.text}
                {!readOnly && <span className="text-muted">✕</span>}
              </button>
            </li>
          ))}
        </ul>
        {!readOnly && seat.reminders.length < MAX_REMINDERS && (
          <button type="button" className={plain} onClick={() => setPicking(picking === "reminder" ? null : "reminder")} aria-expanded={picking === "reminder"}>
            {t.addReminder}
          </button>
        )}
        {picking === "reminder" && (
          <div className="flex flex-col gap-2 rounded-xl border border-border p-2">
            <ReminderChoices onPick={addReminder} />
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (custom.trim()) addReminder(null, custom.trim().slice(0, 80));
                setCustom("");
              }}
            >
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder={t.customReminder}
                maxLength={80}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-base"
              />
              <button type="submit" className={plain}>
                {t.add}
              </button>
            </form>
          </div>
        )}
      </section>

      <PlaceControls seat={seat} index={index} onRemoved={onRemoved} />
    </div>
  );
}

/** A gap in the circle: what it is, and its place. */
function GapPanel({ seat, index, onRemoved }: { seat: GrimoireSeat & { gap: GapKind }; index: number; onRemoved: () => void }) {
  const { t } = useGrimoire();
  return (
    <div className="flex flex-col gap-4" data-testid="seat-panel">
      <h3 className="flex items-center gap-2 text-xl font-bold">
        <span aria-hidden>{gapIcon[seat.gap]}</span>
        {t.gaps[seat.gap]}
      </h3>
      <p className="text-sm text-muted">{t.gapHints[seat.gap]}</p>
      <PlaceControls seat={seat} index={index} onRemoved={onRemoved} />
    </div>
  );
}

/** Moving a place around the circle, putting a gap after a player, taking the place out of the circle. */
function PlaceControls({ seat, index, onRemoved }: { seat: GrimoireSeat; index: number; onRemoved: () => void }) {
  const { state, update, readOnly, t } = useGrimoire();
  if (readOnly) return null;
  const move = (by: number) => update((s) => ({ ...s, seats: moveSeat(s.seats, index, (index + by + s.seats.length) % s.seats.length) }));
  const insertGap = (gap: GapKind) =>
    update((s) => (s.seats.length >= MAX_SEATS ? s : { ...s, seats: [...s.seats.slice(0, index + 1), newGap(gap), ...s.seats.slice(index + 1)] }));
  const hasStoryteller = state.seats.some((s) => s.gap === "storyteller");
  return (
    <>
      {!seat.gap && (
        <section className="flex flex-col gap-2 border-t border-border pt-3">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{t.insertAfter}</h3>
          <div className="flex flex-wrap gap-2">
            {gapKinds.map((gap) => (
              <button
                key={gap}
                type="button"
                className={plain}
                onClick={() => insertGap(gap)}
                disabled={state.seats.length >= MAX_SEATS || (gap === "storyteller" && hasStoryteller)}
              >
                {gapIcon[gap]} {t.gaps[gap]}
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="flex flex-wrap gap-2 border-t border-border pt-3">
        <button type="button" className={plain} onClick={() => move(-1)} disabled={state.seats.length < 2}>
          {t.moveBack}
        </button>
        <button type="button" className={plain} onClick={() => move(1)} disabled={state.seats.length < 2}>
          {t.moveOn}
        </button>
        <button
          type="button"
          className={`${big} ml-auto border-accent text-accent hover:bg-accent/10`}
          onClick={() => {
            if (!seat.gap && !confirm(fill(t.removeSeatConfirm, { name: seat.name }))) return;
            update((s) => ({ ...s, seats: s.seats.filter((x) => x.id !== seat.id) }));
            onRemoved();
          }}
        >
          {t.removeSeat}
        </button>
      </section>
    </>
  );
}

function SeatName({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const { readOnly, t } = useGrimoire();
  const [value, setValue] = useState(name);
  const save = () => {
    const v = value.trim().slice(0, 60);
    if (v && v !== name) onSave(v);
    else setValue(name);
  };
  if (readOnly) return <h3 className="text-xl font-bold">{name}</h3>;
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      aria-label={t.seatName}
      placeholder={t.seatName}
      maxLength={60}
      className="min-h-11 rounded-lg border border-border bg-card px-3 text-xl font-bold"
    />
  );
}

/** The reminder tokens of the characters in play, and the ones any character of the script may hand out. */
function ReminderChoices({ onPick }: { onPick: (roleId: string, text: string) => void }) {
  const { state, characters, locale } = useGrimoire();
  const inPlay = charactersInPlay(state);
  const options = [...new Set([...inPlay, ...state.script.roleIds])]
    .map((id) => {
      const c = characters[id];
      const texts = c ? [...(inPlay.has(id) ? c.reminders : []), ...c.remindersGlobal] : [];
      return { id, texts: [...new Set(texts)] };
    })
    .filter((o) => o.texts.length > 0)
    .sort((a, b) => Number(inPlay.has(b.id)) - Number(inPlay.has(a.id)));
  return (
    <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
      {options.map((o) => (
        <li key={o.id} className="flex flex-wrap items-center gap-1.5">
          <RoleIcon roleId={o.id} size={28} />
          <span className="text-xs text-muted">{nameOf(o.id, locale)}</span>
          {o.texts.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => onPick(o.id, text)}
              className="min-h-10 rounded-full border border-border bg-card px-3 text-sm hover:border-accent/50"
            >
              {text}
            </button>
          ))}
        </li>
      ))}
    </ul>
  );
}
