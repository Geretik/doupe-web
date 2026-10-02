"use client";

import { useActionState } from "react";
import { setupFirstAdminAction } from "@/app/actions/admin";
import type { Dict } from "@/i18n/dictionaries";
import type { FormState } from "@/lib/validation";
import { keepValues } from "../keep-values";
import { Alert, Button, Field, inputClass } from "../ui";
import { AccountFields } from "./account-fields";

export function SetupForm({ t }: { t: Dict["admin"]["setup"] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setupFirstAdminAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t.intro}</p>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Field label={t.bootstrapPassword} name="bootstrapPassword" errors={fe.bootstrapPassword}>
        <input id="bootstrapPassword" name="bootstrapPassword" type="password" required autoFocus autoComplete="off" data-1p-ignore data-lpignore="true" className={inputClass} />
      </Field>
      <AccountFields t={t} fe={fe} />
      <Button type="submit" disabled={pending}>{pending ? t.submitting : t.submit}</Button>
    </form>
  );
}
