"use client";

import { useActionState } from "react";
import { addAttendanceAction, type AddAttendanceState } from "@/app/actions/attendance-admin";
import type { Dict } from "@/i18n/dictionaries";
import { keepValues } from "../keep-values";
import { Alert, Button, Field, inputClass } from "../ui";

type Affiliation = keyof Dict["attendance"]["affiliations"];

/** Admin → Prezenčka: puts someone on the sheet of a night by hand. */
export function AttendanceAddForm({
  t,
  fields,
  affiliations,
  day,
}: {
  t: Dict["admin"]["attendance"]["add"];
  fields: Dict["attendance"]["form"];
  affiliations: Dict["attendance"]["affiliations"];
  /** "YYYY-MM-DD" the form starts with: the night shown */
  day: string;
}) {
  const [state, action, pending] = useActionState<AddAttendanceState, FormData>(addAttendanceAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    // a new night shown = a new form with that day
    <form key={day} action={action} onSubmit={keepValues(action)} className="flex flex-col gap-3" data-testid="attendance-add">
      <p className="text-sm text-muted">{t.hint}</p>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert kind="success">{state.message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_1fr]">
        <Field label={t.day} name="add-day" errors={fe.day}>
          <input id="add-day" name="day" type="date" required defaultValue={day} className={inputClass} />
        </Field>
        <Field label={fields.firstName} name="add-firstName" errors={fe.firstName}>
          <input id="add-firstName" name="firstName" required maxLength={100} autoComplete="off" className={inputClass} />
        </Field>
        <Field label={fields.lastName} name="add-lastName" errors={fe.lastName}>
          <input id="add-lastName" name="lastName" required maxLength={100} autoComplete="off" className={inputClass} />
        </Field>
      </div>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <legend className="mb-1 font-medium">{fields.affiliation}</legend>
        {(Object.keys(affiliations) as Affiliation[]).map((a) => (
          <label key={a} className="flex items-center gap-2">
            <input type="radio" name="affiliation" value={a} required className="h-4 w-4 accent-accent" />
            {affiliations[a]}
          </label>
        ))}
        {fe.affiliation?.map((e) => (
          <p key={e} className="basis-full text-xs text-accent">
            {e}
          </p>
        ))}
      </fieldset>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t.submitting : t.submit}
        </Button>
      </div>
    </form>
  );
}
