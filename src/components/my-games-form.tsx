"use client";

import { useActionState } from "react";
import { requestMyGamesLinkAction } from "@/app/actions/registration";
import type { FormState } from "@/lib/validation";
import { keepValues } from "./keep-values";
import { Alert, Button, Field, inputClass } from "./ui";

export function MyGamesForm({ t }: { t: { email: string; submit: string; submitting: string; sent: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestMyGamesLinkAction, {});
  if (state.ok) return <Alert kind="success">{t.sent}</Alert>;
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Field label={t.email} name="email" errors={fe.email}>
        <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? t.submitting : t.submit}</Button>
    </form>
  );
}
