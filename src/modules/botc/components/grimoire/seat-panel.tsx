"use client";

import { useState } from "react";
import { botcRoles, findRole, linkedRoleOf } from "@/modules/botc/lib/botc-roles";
import {
  changeRole,
  charactersInPlay,
  gapKinds,
  isTraveller,
  lleechHost,
  MAX_REMINDERS,
  MAX_SEATS,
  moveSeat,
  newGap,
  registersDead,
  setDead,
  sides,
  stormcaught,
  survives,
  toggleReminder,
  uid,
  usedToken,
  type GapKind,
  type GrimoireSeat,
  type Side,
  type GrimoireState,
} from "@/modules/botc/lib/grimoire/state";
import { fill } from "@/modules/botc/lib/grimoire/text";
import { nameOf, RoleIcon, useGrimoire } from "./context";
import { RoleGrid } from "./role-grid";
import { ShowButton } from "./show";
import { gapIcon } from "./town";
import { youAreCard } from "@/modules/botc/lib/grimoire/show";

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
export function SeatPanel({
  seatId,
  onRemoved,
  onSelect,
  onClose,
}: {
  seatId: string | null;
  onRemoved: () => void;
  onSelect: (seatId: string) => void;
  /** Lets go of the player: nobody selected in the town */
  onClose: () => void;
}) {
  const { state, update, readOnly, hidden, sessionPlayers, t } = useGrimoire();
  const index = state.seats.findIndex((s) => s.id === seatId);
  const seat = index >= 0 ? state.seats[index] : null;
  if (!seat) return <p className="text-sm text-muted">{t.pickSeat}</p>;

  if (seat.gap) return <GapPanel seat={{ ...seat, gap: seat.gap }} index={index} onRemoved={onRemoved} onClose={onClose} />;

  const set = (change: (seat: GrimoireSeat) => GrimoireSeat) => update((s) => changeSeat(s, seat.id, change));
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

  return (
    <div className="flex flex-col gap-4" data-testid="seat-panel">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <SeatName key={`${seat.id}-${seat.name}`} name={seat.name} onSave={setName} />
        </div>
        <CloseButton onClose={onClose} />
      </div>
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

      {hidden ? (
        <p className="text-sm text-muted" data-testid="seat-hidden">
          {t.hiddenSeat}
        </p>
      ) : (
        <SeatSecrets seat={seat} />
      )}
      {seat.dead && <p className="-mt-2 text-sm text-muted">{seat.voteUsed ? t.voteUsed : t.ghostVote}</p>}

      <PlaceControls seat={seat} index={index} onRemoved={onRemoved} />
    </div>
  );
}

/** What only the Storyteller sees of a player: the character, who they think they are, death, reminders. */
function SeatSecrets({ seat }: { seat: GrimoireSeat }) {
  const { state, update, readOnly, characters, locale, t } = useGrimoire();
  const [picking, setPicking] = useState<"role" | "linked" | "reminder" | null>(null);
  const [custom, setCustom] = useState("");
  const set = (change: (seat: GrimoireSeat) => GrimoireSeat) => update((s) => changeSeat(s, seat.id, change));
  const linked = linkedRoleOf(seat.role);
  const others = holders(state, seat.id);
  // a once-per-game ability (the Slayer's shot…) is marked used with the character's "No ability" token, or one of the grimoire's own
  const usedText = usedToken(seat.role ? characters[seat.role] : undefined, t.abilityUsed);
  const used = !!usedText && seat.reminders.some((r) => r.roleId === seat.role && r.text === usedText);
  const toggleUsed = () => update((s) => toggleReminder(s, seat.id, seat.role, usedText!));
  const addReminder = (roleId: string | null, text: string) => {
    set((x) => ({ ...x, reminders: [...x.reminders, { id: uid(), roleId, text, round: state.round }].slice(0, MAX_REMINDERS) }));
    setPicking(null);
  };

  return (
    <>
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
        {seat.role && !readOnly && <ShowButton card={youAreCard(state, seat, characters)} />}
        {usedText && !readOnly && (
          <button
            type="button"
            className={`${big} ${used ? "border-border bg-border/40 text-muted" : "border-accent text-accent"}`}
            aria-pressed={used}
            onClick={toggleUsed}
            data-testid="ability-used"
          >
            {used ? `✓ ${t.abilityUsed}` : t.abilityUse}
          </button>
        )}
        {picking === "role" && (
          <>
            {seat.role && (
              <button type="button" className={plain} onClick={() => (update((s) => changeRole(s, seat.id, null)), setPicking(null))}>
                {t.noRoleOption}
              </button>
            )}
            <RoleGrid
              roleIds={[...state.script.roleIds, ...travellers.filter((id) => !state.script.roleIds.includes(id))]}
              marked={new Set(seat.role ? [seat.role] : [])}
              notes={others}
              label={t.role}
              onPick={(role) => {
                // during the game logged in the chronicle (the Kazali's Minions, a Pit-Hag…)
                update((s) => changeRole(s, seat.id, role));
                setPicking(null);
              }}
            />
          </>
        )}
        {isTraveller(seat.role) && <TravellerSide seat={seat} />}
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
            onClick={() => update((s) => setDead(s, seat.id, !seat.dead, characters))}
          >
            {seat.dead ? t.revive : t.kill}
          </button>
          {seat.dead && (
            <button type="button" className={plain} onClick={() => set((x) => ({ ...x, voteUsed: !x.voteUsed }))} aria-pressed={seat.voteUsed}>
              {seat.voteUsed ? t.voteBack : t.voteSpend}
            </button>
          )}
          {registersDead(state, seat) && (
            // the Zombuul after their first death: alive, so they can still die
            <button
              type="button"
              className={`${big} col-span-2 border-accent bg-accent text-accent-foreground`}
              onClick={() => update((s) => setDead(s, seat.id, true, characters))}
            >
              {t.killForReal}
            </button>
          )}
        </section>
      )}
      {registersDead(state, seat) && <p className="-mt-2 text-sm font-medium text-accent">{fill(t.registersDead, { name: seat.name || "?" })}</p>}
      <SurvivalNote seat={seat} />

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
    </>
  );
}

/** Good or evil for a traveller, as the Storyteller chooses: the colour of their token and how the rules count them. */
function TravellerSide({ seat }: { seat: GrimoireSeat }) {
  const { update, readOnly, t } = useGrimoire();
  return (
    <>
      <SidePicker value={seat.side} disabled={readOnly} onChange={(side) => update((s) => changeSeat(s, seat.id, (x) => ({ ...x, side })))} />
      {!seat.side && <p className="text-xs text-muted">{t.travellerNoSide}</p>}
    </>
  );
}

/** 😇 / 😈 for a traveller; tapping the chosen one again leaves it unchosen. */
export function SidePicker({ value, onChange, disabled = false }: { value?: Side; onChange: (side: Side | undefined) => void; disabled?: boolean }) {
  const { t } = useGrimoire();
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="traveller-side">
      <span className="text-sm">{t.travellerSide}:</span>
      {sides.map((side) => (
        <button
          key={side}
          type="button"
          disabled={disabled}
          aria-pressed={value === side}
          onClick={() => onChange(value === side ? undefined : side)}
          className={`${big} ${value === side ? (side === "good" ? "border-good bg-good/10 font-semibold" : "border-accent bg-accent/10 font-semibold") : "border-border bg-card hover:border-accent/50"}`}
        >
          {t.travellerSides[side]}
        </button>
      ))}
    </div>
  );
}

/**
 * Why the player does not die now though killed (survives: the Lleech's host, the Sailor, the Fool, the Tea Lady's
 * neighbours, the Vizier by day, the Devil's Advocate's choice), the Storm Catcher's player who only dies by
 * execution, and the Psychopath's roshambo by day.
 */
function SurvivalNote({ seat }: { seat: GrimoireSeat }) {
  const { state, characters, t } = useGrimoire();
  if (seat.dead) return null;
  if (stormcaught(state, seat, characters)) return <p className="-mt-2 text-sm font-medium text-accent">{t.stormcaught}</p>;
  const why = survives(state, seat, characters);
  const host = why === "lleech" ? lleechHost(state, characters) : null;
  const note =
    why === "lleech" && host
      ? fill(t.lleechHost, { name: host.name || "?" })
      : why === "vizier"
        ? t.vizierDay
        : why === "devilsadvocate"
          ? t.devilsAdvocateDay
          : why === "sailor" || why === "fool" || why === "tealady"
            ? t.cannotDie[why]
            : seat.role === "psychopath" && state.phase === "day"
              ? t.psychopathDay
              : null;
  return note ? <p className="-mt-2 text-sm font-medium text-accent">{note}</p> : null;
}

/** ✕ at the top of the panel: nobody selected, so in the day no player stays lit up in the town. */
function CloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useGrimoire();
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={t.deselect}
      title={t.deselect}
      className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-lg hover:border-accent/50"
      data-testid="deselect"
    >
      ✕
    </button>
  );
}

/** A gap in the circle: what it is, and its place. */
function GapPanel({
  seat,
  index,
  onRemoved,
  onClose,
}: {
  seat: GrimoireSeat & { gap: GapKind };
  index: number;
  onRemoved: () => void;
  onClose: () => void;
}) {
  const { t } = useGrimoire();
  return (
    <div className="flex flex-col gap-4" data-testid="seat-panel">
      <div className="flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 text-xl font-bold">
          <span aria-hidden>{gapIcon[seat.gap]}</span>
          {t.gaps[seat.gap]}
        </h3>
        <CloseButton onClose={onClose} />
      </div>
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

/** The reminder tokens of the characters in play (the Fabled and Loric too), and the ones any character of the script may hand out. */
function ReminderChoices({ onPick }: { onPick: (roleId: string, text: string) => void }) {
  const { state, characters, locale } = useGrimoire();
  const inPlay = new Set([...charactersInPlay(state), ...(state.fabled ?? [])]);
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
