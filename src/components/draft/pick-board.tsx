"use client";

import { useActionState, useState } from "react";
import type { PickState } from "@/app/actions/draft";
import type { Locale } from "@/i18n/dictionaries";
import { Alert, Button } from "../ui";
import { OptionChips } from "./role-chips";
import { TeamSection, type GroupKey } from "./team-section";

export type BoardOption = { id: number; roleIds: string[]; label: string; fits: boolean };
export type BoardGroup = { group: GroupKey; label: string; options: BoardOption[] };

/**
 * What is left to pick. On turn, clicking an option only selects it; the pick is saved by "Confirm pick", so a
 * slip of the mouse costs nothing. The form sends the pick number the page shows: the server refuses the pick
 * when the draft has moved on since (another tab, a double click).
 */
export function PickBoard({
  action,
  pickNumber,
  onTurn,
  groups,
  locale,
  t,
}: {
  action: (prev: PickState, formData: FormData) => Promise<PickState>;
  pickNumber: number;
  onTurn: boolean;
  groups: BoardGroup[];
  locale: Locale;
  t: { choose: string; confirm: string; back: string; picking: string; selected: string; doesNotFit: string };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // a selection belongs to the pick it was made for; a new pick number starts with none
  const [selection, setSelection] = useState<{ id: number; pick: number } | null>(null);
  const selectedId = selection?.pick === pickNumber ? selection.id : null;
  const selected = groups.flatMap((g) => g.options).find((o) => o.id === selectedId);

  return (
    <div className="flex flex-col gap-3" data-testid="pick-board">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert kind="success">{state.message}</Alert>}
      {onTurn && selected && (
        <form
          action={formAction}
          className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-accent bg-card p-3 shadow-md"
        >
          <input type="hidden" name="optionId" value={selected.id} />
          <input type="hidden" name="pickNumber" value={pickNumber} />
          <span className="text-sm font-medium">{t.selected}</span>
          <OptionChips roleIds={selected.roleIds} locale={locale} />
          <span className="ml-auto flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? t.picking : t.confirm}</Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => setSelection(null)}>
              {t.back}
            </Button>
          </span>
        </form>
      )}
      {groups.map((g) => (
        <TeamSection key={g.group} group={g.group} label={g.label} count={g.options.length}>
          <ul className="flex flex-wrap gap-1.5">
            {g.options.map((o) => {
              const active = onTurn && o.fits;
              const isSelected = o.id === selectedId;
              return (
                <li key={o.id}>
                  {active ? (
                    <button
                      type="button"
                      onClick={() => setSelection({ id: o.id, pick: pickNumber })}
                      aria-pressed={isSelected}
                      data-option={o.roleIds.join("+")}
                      aria-label={`${t.choose}: ${o.label}`}
                      className={`rounded-full p-0.5 ring-offset-1 transition hover:ring-2 hover:ring-accent/50 ${isSelected ? "ring-2 ring-accent" : ""}`}
                    >
                      <OptionChips roleIds={o.roleIds} locale={locale} />
                    </button>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 p-0.5 ${onTurn ? "opacity-40" : ""}`}
                      title={onTurn ? t.doesNotFit : undefined}
                      data-option={o.roleIds.join("+")}
                    >
                      <OptionChips roleIds={o.roleIds} locale={locale} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </TeamSection>
      ))}
    </div>
  );
}
