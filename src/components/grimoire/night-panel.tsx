"use client";

import type { NightStep, SpecialStep } from "@/lib/grimoire/state";
import { fill } from "@/lib/grimoire/text";
import { nameOf, RoleIcon, useGrimoire } from "./context";

const specialIcon: Record<SpecialStep, string> = { dusk: "🌙", minionInfo: "🗡️", demonInfo: "😈", dawn: "☀️" };

/**
 * The night's steps in order. The first step not done is the current one: its text is open and the
 * seats that wake glow in the town. Tapping a step shows its text and seats without ticking it.
 */
export function NightPanel({
  steps,
  currentId,
  focusId,
  onFocus,
  onNext,
}: {
  steps: NightStep[];
  currentId: string | null;
  focusId: string | null;
  onFocus: (stepId: string | null) => void;
  onNext: () => void;
}) {
  const { state, update, readOnly, characters, locale, t } = useGrimoire();
  const first = state.round === 1;
  const done = new Set(state.nightDone);
  const seats = new Map(state.seats.map((s) => [s.id, s]));
  const toggle = (id: string) =>
    update((s) => ({ ...s, nightDone: s.nightDone.includes(id) ? s.nightDone.filter((x) => x !== id) : [...s.nightDone, id] }));

  return (
    <div className="flex flex-col gap-2" data-testid="night-panel">
      <h3 className="text-lg font-bold">{first ? t.firstNight : fill(t.phases.night, { n: state.round })}</h3>
      <ol className="flex flex-col gap-1.5">
        {steps.map((step) => {
          const isDone = done.has(step.id);
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
              {open && text && <p className="px-3 pb-2 text-sm leading-snug">{text}</p>}
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
      {currentId === null && (
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
