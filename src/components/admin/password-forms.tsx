"use client";

import { useActionState, useState } from "react";
import { changePasswordAction, createPasswordResetAction, requestPasswordResetAction, resetPasswordAction, type ResetLinkResult } from "@/app/actions/admin";
import type { Dict } from "@/i18n/dictionaries";
import type { FormState } from "@/lib/validation";
import { keepValues } from "../keep-values";
import { Alert, Button, Field, inputClass } from "../ui";
import { PasswordFields } from "./account-fields";

export function ChangePasswordForm({ t }: { t: Dict["admin"]["password"] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="success">{t.saved}</Alert>}
      <Field label={t.current} name="currentPassword" errors={fe.currentPassword}>
        <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" className={inputClass} />
      </Field>
      <PasswordFields t={t} fe={fe} />
      <Button type="submit" disabled={pending}>{pending ? t.submitting : t.submit}</Button>
    </form>
  );
}

export function ResetPasswordForm({ token, t }: { token: string; t: Dict["admin"]["reset"] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction.bind(null, token), {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <PasswordFields t={t} fe={fe} />
      <Button type="submit" disabled={pending}>{pending ? t.submitting : t.submit}</Button>
    </form>
  );
}

/** "Forgot password": asks for the account's e-mail; the answer is the same whether the account exists or not. */
export function ForgotPasswordForm({ t }: { t: Dict["admin"]["forgot"] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordResetAction, {});
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

/** On the accounts page: makes a one-time new-password link and shows it for copying. */
export function ResetLinkButton({
  userId,
  t,
}: {
  userId: number;
  t: { resetLink: string; created: string; copy: string; copied: string };
}) {
  const [result, setResult] = useState<ResetLinkResult | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  if (result?.url) {
    return (
      <span className="flex flex-col items-end gap-1 text-left">
        <span className="text-xs text-muted">{t.created}</span>
        <span className="flex flex-wrap items-center justify-end gap-2">
          <code className="select-all break-all text-xs" data-testid="reset-url">{result.url}</code>
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(result.url!);
                setCopied(true);
              } catch {
                /* clipboard unavailable – the link is selectable anyway */
              }
            }}
          >
            {copied ? t.copied : t.copy}
          </Button>
        </span>
      </span>
    );
  }
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        setResult(await createPasswordResetAction(userId));
        setPending(false);
      }}
    >
      {pending ? "…" : t.resetLink}
    </Button>
  );
}
