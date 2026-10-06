"use client";

import { useActionState, useState } from "react";
import type { MessageState } from "@/app/actions/draft";
import type { DraftModeId } from "@/db/schema";
import { keepValues } from "../keep-values";
import { Alert, Button, Field, inputClass } from "../ui";
import type { ModeInfo } from "./draft-form";

/** Name, mode and the mode's numbers of a session – for a new one and while preparing one. */
export function SessionSettingsForm({
  action,
  modes,
  initial,
  t,
}: {
  action: (prev: MessageState, formData: FormData) => Promise<MessageState>;
  /** Modes the Draft allows */
  modes: ModeInfo[];
  initial: { name: string; mode: DraftModeId; config: Partial<Record<DraftModeId, Record<string, number>>> };
  t: { name: string; mode: string; submit: string; saving: string };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [mode, setMode] = useState<DraftModeId>(modes.some((m) => m.id === initial.mode) ? initial.mode : modes[0]?.id ?? initial.mode);
  const current = modes.find((m) => m.id === mode);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert kind="success">{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* ids with a prefix: the Draft page has the Draft form with its own "name" too */}
        <Field label={t.name} name="session-name" errors={errors.name}>
          <input id="session-name" name="name" required maxLength={100} defaultValue={initial.name} className={inputClass} />
        </Field>
        <Field label={t.mode} name="session-mode" hint={current?.description} errors={errors.mode}>
          <select id="session-mode" name="mode" value={mode} onChange={(e) => setMode(e.target.value as DraftModeId)} className={inputClass}>
            {modes.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </Field>
        {current?.fields.map((f) => {
          const name = `${current.id}.${f.key}`;
          return (
            <Field key={name} label={f.label} name={`session-${name}`} errors={errors[name]}>
              <input
                id={`session-${name}`}
                name={name}
                type="number"
                min={f.min}
                max={f.max}
                required
                defaultValue={initial.config[current.id]?.[f.key] ?? f.default}
                className={inputClass}
              />
            </Field>
          );
        })}
      </div>
      <div>
        <Button type="submit" disabled={pending}>{pending ? t.saving : t.submit}</Button>
      </div>
    </form>
  );
}
