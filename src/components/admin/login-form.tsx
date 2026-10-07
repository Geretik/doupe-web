"use client";

import { useActionState } from "react";
import { loginAction, requestLoginLinkAction } from "@/app/actions/admin";
import type { Dict } from "@/i18n/dictionaries";
import type { FormState } from "@/lib/validation";
import { keepValues } from "../keep-values";
import { Alert, Button, Field, inputClass } from "../ui";

export function LoginForm({ t }: { t: Dict["admin"]["login"] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Field label={t.email} name="email">
        <input id="email" name="email" type="email" required autoFocus autoComplete="username" className={inputClass} />
      </Field>
      <Field label={t.password} name="password">
        <input id="password" name="password" type="password" required autoComplete="current-password" className={inputClass} />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? t.checking : t.submit}</Button>
    </form>
  );
}

/** "Log in with a link from an e-mail": asks for the account's e-mail; the answer is the same whether the account exists or not. */
export function LoginLinkForm({ t }: { t: Dict["admin"]["loginLink"] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestLoginLinkAction, {});
  if (state.ok) return <Alert kind="success">{t.sent}</Alert>;
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t.intro}</p>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Field label={t.email} name="email" errors={fe.email}>
        <input id="email" name="email" type="email" required autoFocus autoComplete="username" className={inputClass} />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? t.submitting : t.submit}</Button>
    </form>
  );
}
