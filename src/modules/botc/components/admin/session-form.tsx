"use client";

import { useActionState } from "react";
import { arrivalModes, gameLanguages, registrationStates, type RegistrationState, type Session } from "@/db/schema";
import type { Dict } from "@/i18n/dictionaries";
import type { FormSuggestions } from "@/modules/botc/lib/form-suggestions";
import type { FormState } from "@/lib/validation";
import { keepValues } from "@/components/keep-values";
import { Alert, Button, Checkbox, Field, inputClass } from "@/components/ui";
import { PlaylistFields } from "./playlist-fields";
import { ScriptsFields } from "./scripts-fields";
import { OpensAtField, SessionTimeFields } from "./session-time-fields";

export function SessionForm({
  action: serverAction,
  session,
  defaults,
  today,
  suggestions,
  mode = session ? "edit" : "create",
  discordConfigured = false,
  t,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  /** Prefilled values – the session being edited, or a template when duplicating */
  session?: Pick<Session, "title" | "place" | "capacity" | "gameLanguage" | "storyteller" | "note" | "scripts" | "scriptPoll" | "playlist" | "arrivalMode" | "phoneRequired" | "registrationState">;
  /** datetime-local strings in Prague time (the date part may be empty); the sign-up state as players see it right now */
  defaults?: { startsAt: string; endsAt: string; registrationState?: RegistrationState; registrationOpensAt?: string };
  /** "YYYY-MM-DD" in Prague time – calendars offer no earlier date (the session date only when creating) */
  today: string;
  /** Places, storytellers and scripts used before, offered while typing */
  suggestions?: FormSuggestions;
  mode?: "create" | "edit";
  discordConfigured?: boolean;
  t: Dict["admin"]["form"];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(serverAction, {});
  const fe = state.fieldErrors ?? {};
  const regState = defaults?.registrationState ?? session?.registrationState ?? "open";
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="success">{t.saved}</Alert>}
      <Field label={t.title} name="title" errors={fe.title}>
        <input id="title" name="title" required defaultValue={session?.title ?? ""} className={inputClass} placeholder={t.titlePlaceholder} />
      </Field>
      <SessionTimeFields
        startsAt={defaults?.startsAt}
        endsAt={defaults?.endsAt}
        minDate={mode === "create" ? today : undefined}
        errors={{ startsAt: fe.startsAt, endsAt: fe.endsAt }}
        t={t}
      />
      <Field label={t.place} name="place" errors={fe.place}>
        <input id="place" name="place" required defaultValue={session?.place ?? ""} list="place-suggestions" autoComplete="off" className={inputClass} />
        <Suggestions id="place-suggestions" values={suggestions?.places} />
      </Field>
      <Field label={t.gameLanguage} name="gameLanguage" errors={fe.gameLanguage} hint={t.gameLanguageHint}>
        <select id="gameLanguage" name="gameLanguage" defaultValue={session?.gameLanguage ?? "cs"} className={inputClass}>
          {gameLanguages.map((l) => (
            <option key={l} value={l}>{t.gameLanguages[l]}</option>
          ))}
        </select>
      </Field>
      <Field label={t.capacity} name="capacity" errors={fe.capacity} hint={mode === "edit" ? t.capacityHint : undefined}>
        <input id="capacity" name="capacity" type="number" min={1} max={500} required defaultValue={session?.capacity ?? 15} className={inputClass} />
      </Field>
      <Field label={t.registrationState} name="registrationState" errors={fe.registrationState} hint={t.registrationStateHint}>
        {/* the key remounts it after the one-click Open / Pause switch: a select ignores a new defaultValue,
            and saving the form would otherwise bring the old state back */}
        <select key={regState} id="registrationState" name="registrationState" defaultValue={regState} className={inputClass}>
          {registrationStates.map((s) => (
            <option key={s} value={s}>
              {s === "open" ? t.registrationOpen : s === "not_open" ? t.registrationNotOpen : t.registrationPaused}
            </option>
          ))}
        </select>
      </Field>
      {/* same for the switch clearing a scheduled opening */}
      <OpensAtField key={defaults?.registrationOpensAt} value={defaults?.registrationOpensAt} minDate={today} errors={fe.registrationOpensAt} t={t} />
      <Field label={t.arrivalMode} name="arrivalMode" errors={fe.arrivalMode} hint={t.arrivalModeHint}>
        <select id="arrivalMode" name="arrivalMode" defaultValue={session?.arrivalMode ?? "times"} className={inputClass}>
          {arrivalModes.map((m) => (
            <option key={m} value={m}>{m === "times" ? t.arrivalModeTimes : t.arrivalModeLate}</option>
          ))}
        </select>
      </Field>
      <Checkbox name="phoneRequired" label={t.phoneRequired} hint={t.phoneRequiredHint} defaultChecked={session?.phoneRequired ?? true} />
      <Field label={t.storyteller} name="storyteller" errors={fe.storyteller} hint={t.storytellerHint}>
        <input id="storyteller" name="storyteller" maxLength={200} defaultValue={session?.storyteller ?? ""} list="storyteller-suggestions" autoComplete="off" className={inputClass} placeholder="🎩 Honza" />
        <Suggestions id="storyteller-suggestions" values={suggestions?.storytellers} />
      </Field>
      <Field label={t.note} name="note" errors={fe.note} hint={t.noteHint}>
        <textarea id="note" name="note" rows={3} defaultValue={session?.note ?? ""} className={inputClass} />
      </Field>
      <ScriptsFields
        initial={session?.scripts ?? []}
        known={suggestions?.scripts}
        errors={fe.scripts}
        t={{
          title: t.scripts,
          hint: t.scriptsHint,
          namePlaceholder: t.scriptNamePlaceholder,
          urlPlaceholder: "https://…",
          nameLabel: t.scriptNameLabel,
          urlLabel: t.scriptUrlLabel,
          remove: t.removeScript,
          add: t.addScript,
        }}
      />
      <ScriptsFields
        initial={session?.scriptPoll ?? []}
        known={suggestions?.scripts}
        errors={fe.scriptPoll}
        fields={{ name: "pollName", url: "pollUrl" }}
        listId="poll-suggestions"
        t={{
          title: t.poll,
          hint: t.pollHint,
          namePlaceholder: t.scriptNamePlaceholder,
          urlPlaceholder: t.pollUrlPlaceholder,
          nameLabel: t.pollNameLabel,
          urlLabel: t.pollUrlLabel,
          remove: t.pollRemove,
          add: t.pollAdd,
        }}
      />
      <PlaylistFields initial={session?.playlist ?? []} errors={fe.playlist} t={t} />
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

/** Earlier values the browser offers under a text field; typing something new still works */
function Suggestions({ id, values = [] }: { id: string; values?: string[] }) {
  return (
    <datalist id={id}>
      {values.map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  );
}
