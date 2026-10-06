"use client";

import { useActionState } from "react";
import type { MessageState } from "@/app/actions/draft";
import { keepValues } from "../keep-values";
import { Alert, Button, Field, inputClass } from "../ui";

/**
 * A script from a draft pool: name, author and which of the pool's characters it has. Only the pool's characters
 * are offered here, and the server checks it again on every save.
 */
export function DraftScriptForm({
  action,
  initial,
  groups,
  t,
}: {
  action: (prev: MessageState, formData: FormData) => Promise<MessageState>;
  initial: { name: string; author: string; roleIds: string[]; version: number };
  groups: { key: string; label: string; roles: { id: string; name: string; className: string }[] }[];
  t: { name: string; author: string; roles: string; rolesHint: string; save: string; saving: string };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const chosen = new Set(initial.roleIds);
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="flex flex-col gap-4" data-testid="script-form">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert kind="success">{state.message}</Alert>}
      <input type="hidden" name="version" value={initial.version} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.name} name="name" errors={errors.name}>
          <input id="name" name="name" required maxLength={100} defaultValue={initial.name} className={inputClass} />
        </Field>
        <Field label={t.author} name="author">
          <input id="author" name="author" maxLength={100} defaultValue={initial.author} className={inputClass} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{t.roles}</legend>
        <p className="text-xs text-muted">{t.rolesHint}</p>
        {groups.map((g) => (
          <div key={g.key} className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-muted uppercase">{g.label}</span>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-4">
              {g.roles.map((r) => (
                <label key={r.id} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="role" value={r.id} defaultChecked={chosen.has(r.id)} className="h-4 w-4 accent-accent" />
                  {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized WebP from public/, no optimisation needed */}
                  <img src={`/botc/roles/${r.id}.webp`} alt="" width={20} height={20} className="h-5 w-5" />
                  <span className={r.className}>{r.name}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
      <div>
        <Button type="submit" disabled={pending}>{pending ? t.saving : t.save}</Button>
      </div>
    </form>
  );
}
