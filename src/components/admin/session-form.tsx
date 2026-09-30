"use client";

import { useActionState } from "react";
import { arrivalModes, registrationStates, type Session } from "@/db/schema";
import type { Dict } from "@/i18n/dictionaries";
import type { FormState } from "@/lib/validation";
import { Alert, Button, Checkbox, Field, inputClass } from "../ui";
import { ScriptsFields } from "./scripts-fields";

export function SessionForm({
  action: serverAction,
  session,
  defaults,
  mode = session ? "edit" : "create",
  discordConfigured = false,
  t,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  /** Prefilled values – the session being edited, or a template when duplicating */
  session?: Pick<Session, "title" | "place" | "capacity" | "storyteller" | "note" | "scripts" | "arrivalMode" | "phoneRequired" | "registrationState">;
  /** datetime-local strings in Prague time */
  defaults?: { startsAt: string; endsAt: string };
  mode?: "create" | "edit";
  discordConfigured?: boolean;
  t: Dict["admin"]["form"];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(serverAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="success">{t.saved}</Alert>}
      <Field label={t.title} name="title" errors={fe.title}>
        <input id="title" name="title" required defaultValue={session?.title ?? ""} className={inputClass} placeholder={t.titlePlaceholder} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.startsAt} name="startsAt" errors={fe.startsAt}>
          <input id="startsAt" name="startsAt" type="datetime-local" required defaultValue={defaults?.startsAt ?? ""} className={inputClass} />
        </Field>
        <Field label={t.endsAt} name="endsAt" errors={fe.endsAt}>
          <input id="endsAt" name="endsAt" type="datetime-local" required defaultValue={defaults?.endsAt ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label={t.place} name="place" errors={fe.place}>
        <input id="place" name="place" required defaultValue={session?.place ?? ""} className={inputClass} />
      </Field>
      <Field label={t.capacity} name="capacity" errors={fe.capacity} hint={mode === "edit" ? t.capacityHint : undefined}>
        <input id="capacity" name="capacity" type="number" min={1} max={500} required defaultValue={session?.capacity ?? 15} className={inputClass} />
      </Field>
      <Field label={t.registrationState} name="registrationState" errors={fe.registrationState} hint={t.registrationStateHint}>
        <select id="registrationState" name="registrationState" defaultValue={session?.registrationState ?? "open"} className={inputClass}>
          {registrationStates.map((s) => (
            <option key={s} value={s}>
              {s === "open" ? t.registrationOpen : s === "not_open" ? t.registrationNotOpen : t.registrationPaused}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.arrivalMode} name="arrivalMode" errors={fe.arrivalMode} hint={t.arrivalModeHint}>
        <select id="arrivalMode" name="arrivalMode" defaultValue={session?.arrivalMode ?? "times"} className={inputClass}>
          {arrivalModes.map((m) => (
            <option key={m} value={m}>{m === "times" ? t.arrivalModeTimes : t.arrivalModeLate}</option>
          ))}
        </select>
      </Field>
      <Checkbox name="phoneRequired" label={t.phoneRequired} hint={t.phoneRequiredHint} defaultChecked={session?.phoneRequired ?? true} />
      <Field label={t.storyteller} name="storyteller" errors={fe.storyteller} hint={t.storytellerHint}>
        <input id="storyteller" name="storyteller" maxLength={200} defaultValue={session?.storyteller ?? ""} className={inputClass} placeholder="🎩 Honza" />
      </Field>
      <Field label={t.note} name="note" errors={fe.note} hint={t.noteHint}>
        <textarea id="note" name="note" rows={3} defaultValue={session?.note ?? ""} className={inputClass} />
      </Field>
      <ScriptsFields initial={session?.scripts ?? []} errors={fe.scripts} t={t} />
      {mode === "create" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.repeat} name="repeatWeeks" hint={t.repeatHint}>
            <select id="repeatWeeks" name="repeatWeeks" defaultValue="0" className={inputClass}>
              <option value="0">{t.repeatNone}</option>
              <option value="1">{t.repeatEvery}</option>
              <option value="2">{t.repeatEvery2}</option>
              <option value="4">{t.repeatEvery4}</option>
            </select>
          </Field>
          <Field label={t.repeatCount} name="repeatCount">
            <input id="repeatCount" name="repeatCount" type="number" min={1} max={12} defaultValue={4} className={inputClass} />
          </Field>
        </div>
      )}
      {mode === "create" && discordConfigured && (
        <Checkbox name="announceDiscord" label={t.announceDiscord} hint={t.announceDiscordHint} defaultChecked />
      )}
      <Button type="submit" disabled={pending}>
        {pending ? t.saving : mode === "edit" ? t.saveChanges : t.create}
      </Button>
    </form>
  );
}
