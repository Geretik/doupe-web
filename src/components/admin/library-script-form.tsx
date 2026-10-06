"use client";

import { useActionState } from "react";
import type { ScriptFormState } from "@/app/actions/scripts";
import type { Dict } from "@/i18n/dictionaries";
import { keepValues } from "../keep-values";
import { Alert, Button, Field, inputClass } from "../ui";

/**
 * A script of the club's library: a JSON file chosen or pasted, with its name and author. A new script takes
 * them from the file when left empty; when editing, the JSON is optional and replaces the characters.
 */
export function LibraryScriptForm({
  action,
  initial,
  t,
}: {
  action: (prev: ScriptFormState, formData: FormData) => Promise<ScriptFormState>;
  /** The script being edited; none for a new one */
  initial?: { name: string; author: string };
  t: Dict["scripts"]["form"];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const editing = Boolean(initial);
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="flex flex-col gap-4" data-testid="library-script-form">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert kind="success">{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={editing ? t.replaceFile : t.file} name="file" errors={errors.json} hint={editing ? t.replaceHint : undefined}>
          <input id="file" name="file" type="file" accept=".json,application/json" className="text-sm" />
        </Field>
        <Field label={editing ? t.replaceJson : t.json} name="json">
          <textarea
            id="json"
            name="json"
            rows={4}
            spellCheck={false}
            placeholder='[{"id": "_meta", "name": "…"}, "washerwoman", …]'
            className={`${inputClass} font-mono text-xs`}
          />
        </Field>
        <Field label={t.name} name="name" errors={errors.name} hint={editing ? undefined : t.nameFromFile}>
          <input id="name" name="name" maxLength={100} required={editing} defaultValue={initial?.name} className={inputClass} />
        </Field>
        <Field label={t.author} name="author" hint={editing ? undefined : t.authorFromFile}>
          <input id="author" name="author" maxLength={100} defaultValue={initial?.author} className={inputClass} />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending}>{pending ? t.saving : editing ? t.save : t.add}</Button>
      </div>
    </form>
  );
}
