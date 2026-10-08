"use client";

import { findRole } from "@/lib/botc-roles";
import {
  becomeDemon,
  demonProtection,
  evilLivingNeighbours,
  evilPairs,
  impairment,
  remindersOf,
  starPass,
  toggleReminder,
  usedToken,
  type GrimoireState,
  type NightStep,
  type SpecialStep,
} from "@/lib/grimoire/state";
import type { GrimoireCharacter } from "@/lib/grimoire/characters";
import { fill } from "@/lib/grimoire/text";
import { nameOf, RoleIcon, useGrimoire, type GrimoireTexts } from "./context";
import type { Locale } from "@/i18n/dictionaries";

const specialIcon: Record<SpecialStep, string> = { dusk: "🌙", minionInfo: "🗡️", demonInfo: "😈", dawn: "☀️" };

/** A reminder token being put on a player: the next tap in the town puts it there. */
export type Placing = { roleId: string; text: string };

/**
 * The night's steps in order. The first step not done is the current one: its text is open and the
 * seats that wake glow in the town. Tapping a step shows its text and seats without ticking it.
 * `preview`: the first night before the game, to prepare what the information characters are shown.
 */
export function NightPanel({
  steps,
  currentId,
  focusId,
  onFocus,
  onNext,
  preview = false,
  placing,
  onPlace,
}: {
  steps: NightStep[];
  currentId: string | null;
  focusId: string | null;
  onFocus: (stepId: string | null) => void;
  onNext: () => void;
  preview?: boolean;
  placing: Placing | null;
  onPlace: (placing: Placing | null) => void;
}) {
  const { state, update, readOnly, characters, locale, t } = useGrimoire();
  const first = preview || state.round === 1;
  const done = new Set(state.nightDone);
  const seats = new Map(state.seats.map((s) => [s.id, s]));
  const toggle = (id: string) =>
    update((s) => ({ ...s, nightDone: s.nightDone.includes(id) ? s.nightDone.filter((x) => x !== id) : [...s.nightDone, id] }));

  return (
    <div className="flex flex-col gap-2" data-testid="night-panel">
      <h3 className="text-lg font-bold">{preview ? t.nightPrep : first ? t.firstNight : fill(t.phases.night, { n: state.round })}</h3>
      {preview && <p className="text-sm text-muted">{t.nightPrepHint}</p>}
      <ol className="flex flex-col gap-1.5">
        {steps.map((step) => {
          const isDone = !preview && done.has(step.id);
          const isCurrent = step.id === currentId;
          const open = isCurrent || step.id === focusId;
          const name = step.special ? t.steps[step.special] : nameOf(step.roleId, locale);
          const text = step.special
            ? t.stepTexts[step.special]
            : step.roleId
              ? characters[step.roleId]?.[first ? "firstNightReminder" : "otherNightReminder"]
              : "";
          const woken = step.seatIds.flatMap((id) => (seats.has(id) ? [seats.get(id)!] : []));
          const allDead = woken.length > 0 && woken.every((s) => s.dead);
          return (
            <li
              key={step.id}
              className={`rounded-lg border ${isCurrent ? "border-amber-400 bg-amber-400/10" : step.id === focusId ? "border-accent/60" : "border-border"} ${isDone && !open ? "opacity-50" : ""}`}
              data-testid="night-step"
              data-step={step.id}
            >
              <div className="flex items-center gap-2 p-1.5">
                {!preview && (
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => toggle(step.id)}
                    aria-pressed={isDone}
                    aria-label={`${t.done}: ${name}`}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-base ${isDone ? "border-good bg-good text-white" : "border-border"}`}
                  >
                    {isDone && "✓"}
                  </button>
                )}
                <button type="button" onClick={() => onFocus(step.id === focusId ? null : step.id)} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left">
                  {step.roleId ? <RoleIcon roleId={step.roleId} size={32} /> : <span className="w-8 text-center text-xl">{specialIcon[step.special!]}</span>}
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className={`font-semibold ${isDone ? "line-through" : ""}`}>{name}</span>
                    {woken.length > 0 && (
                      <span className={`truncate text-xs ${allDead ? "text-muted" : ""}`}>
                        {woken
                          .map((s) => `${s.name}${s.role && step.roleId && s.role !== step.roleId ? ` (${nameOf(s.role, locale)})` : ""}${s.dead ? " ☠" : ""}`)
                          .join(", ")}
                      </span>
                    )}
                  </span>
                </button>
              </div>
              {open && text && <p className="px-3 pb-2 text-sm leading-snug whitespace-pre-line">{text.replace(/<\/?br\s*\/?>/gi, "\n")}</p>}
              {open && step.roleId && (
                <StepHelp roleId={step.roleId} woken={woken} placing={placing} onPlace={onPlace} canPlace={!readOnly} />
              )}
              {isCurrent && !readOnly && (
                <div className="px-1.5 pb-1.5">
                  <button type="button" onClick={() => toggle(step.id)} className="min-h-11 w-full rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground">
                    {t.done} ↓
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!preview && currentId === null && (
        <div className="flex flex-col gap-2 rounded-lg border border-good/40 bg-good/5 p-3">
          <p className="font-semibold">{t.nightComplete}</p>
          {!readOnly && (
            <button type="button" onClick={onNext} className="min-h-11 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground">
              {fill(t.toDay, { n: state.round })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Under a character's step: a warning when its player may get false information, what to show worked out
 * from the town (the Chef's and Empath's number, the character and two players of a Washerwoman…), who the
 * Demon's attack did not kill and the Imp's heir, the character's reminder tokens to put on a player and
 * where they lie. A token of the character's own player ("No ability", the Scarlet Woman's "Demon") goes
 * straight to them.
 */
function StepHelp({
  roleId,
  woken,
  placing,
  onPlace,
  canPlace,
}: {
  roleId: string;
  woken: GrimoireState["seats"];
  placing: Placing | null;
  onPlace: (placing: Placing | null) => void;
  canPlace: boolean;
}) {
  const { state, update, characters, locale, t } = useGrimoire();
  const c = characters[roleId];
  if (!c) return null;
  const used = usedToken(c, t.abilityUsed);
  const own = new Set([...c.selfTokens, ...(used ? [used] : [])]);
  const tokens = [...new Set([...c.reminders, ...own])];
  // the player the character's own tokens go to: only when one player wakes for it
  const self = woken.length === 1 ? woken[0] : null;
  const placed = remindersOf(state, roleId);
  const info = infoLines(state, roleId, woken, characters, locale, t);
  const pass = roleId === "imp" && state.phase === "night" ? starPass(state, characters) : null;
  const imp = nameOf("imp", locale);
  if (pass?.heir) {
    const scarletWoman = pass.heir.reminders.some((r) => r.roleId === "scarletwoman");
    info.push(fill(t.newDemon, { role: imp, name: `${pass.heir.name || "?"}${scarletWoman ? ` (${nameOf("scarletwoman", locale)})` : ""}` }));
  } else if (pass && !pass.choices.length) info.push(t.noHeir);
  const warnings = woken.flatMap((s) => {
    const why = impairment(state, s, characters);
    return why ? [fill(t.impaired[why], { name: s.name || "?" })] : [];
  });
  if (!info.length && !warnings.length && !tokens.length) return null;
  return (
    <div className="flex flex-col gap-1.5 px-3 pb-2 text-sm" data-testid="step-help">
      {warnings.map((w) => (
        <p key={w} className="font-medium text-accent">
          ⚠️ {w}
        </p>
      ))}
      {info.map((line) => (
        <p key={line} className="rounded-md bg-amber-400/15 px-2 py-1 font-semibold" data-testid="step-info">
          👉 {line}
        </p>
      ))}
      {pass && !pass.heir && pass.choices.length > 0 && canPlace && (
        <div className="flex flex-col gap-1.5 rounded-md bg-amber-400/15 px-2 py-1.5" data-testid="imp-heirs">
          <p className="font-semibold">👉 {fill(t.pickHeir, { role: imp })}</p>
          <div className="flex flex-wrap gap-1.5">
            {pass.choices.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => update((x) => becomeDemon(x, s.id, "imp", characters))}
                className="flex min-h-10 items-center gap-1.5 rounded-full border border-accent bg-card px-2.5 text-sm font-medium hover:bg-accent/10"
              >
                {s.role && <RoleIcon roleId={s.role} size={20} />}
                {s.name || "?"}
              </button>
            ))}
          </div>
        </div>
      )}
      {placed.length > 0 && (
        <p className="text-xs text-muted">
          {placed.map(({ seat, reminder }) => `${reminder.text}: ${seat.name || "?"}`).join(" · ")}
        </p>
      )}
      {canPlace && tokens.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tokens.map((text) => {
            if (self && own.has(text)) {
              const on = self.reminders.some((r) => r.roleId === roleId && r.text === text);
              return (
                <button
                  key={text}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update((s) => toggleReminder(s, self.id, roleId, text))}
                  className={`flex min-h-10 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${on ? "border-border bg-border/40 text-muted" : "border-accent bg-card text-accent hover:bg-accent/10"}`}
                >
                  <RoleIcon roleId={roleId} size={20} />
                  {on ? `✓ ${text}` : text}
                </button>
              );
            }
            const active = placing?.roleId === roleId && placing.text === text;
            return (
              <button
                key={text}
                type="button"
                aria-pressed={active}
                onClick={() => onPlace(active ? null : { roleId, text })}
                className={`flex min-h-10 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card hover:border-accent/50"}`}
              >
                <RoleIcon roleId={roleId} size={20} />
                {text} →
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** What to show the character's player, worked out from the town; empty when there is nothing to work out. */
function infoLines(
  state: GrimoireState,
  roleId: string,
  woken: GrimoireState["seats"],
  characters: Record<string, GrimoireCharacter>,
  locale: Locale,
  t: GrimoireTexts,
) {
  const c = characters[roleId];
  // Washerwoman, Librarian, Investigator: the character of the player under the first token, and both players
  if (Object.values(c.tokenKinds).includes("wrong")) {
    const placed = remindersOf(state, roleId);
    const right = placed.find(({ reminder }) => c.tokenKinds[reminder.text] !== "wrong");
    const wrong = placed.find(({ reminder }) => c.tokenKinds[reminder.text] === "wrong");
    if (!right || !wrong) return [t.infoPlaceTokens];
    return [fill(t.infoShow, { role: nameOf(right.seat.role, locale), a: right.seat.name || "?", b: wrong.seat.name || "?" })];
  }
  // the Demon's attacks tonight that did not kill: who or what kept the player alive
  if (findRole(roleId)?.team === "demon") {
    if (state.phase !== "night") return [];
    return remindersOf(state, roleId).flatMap(({ seat, reminder }) => {
      if (seat.dead || reminder.round !== state.round || c.tokenKinds[reminder.text] !== "dead") return [];
      const by = seat.reminders.some((r) => r.roleId === "fool" && r.round === state.round) ? "fool" : demonProtection(state, seat.id, characters);
      return by ? [fill(t.survives, { name: seat.name || "?", role: nameOf(by, locale) })] : [];
    });
  }
  if (roleId === "chef") return [fill(t.infoNumber, { n: evilPairs(state) })];
  if (roleId === "empath") {
    return woken.map((s) => (woken.length > 1 ? `${s.name}: ` : "") + fill(t.infoNumber, { n: evilLivingNeighbours(state, s.id) }));
  }
  return [];
}
