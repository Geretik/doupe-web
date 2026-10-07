"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendMessageAction } from "@/app/actions/message";
import type { Dict } from "@/i18n/dictionaries";
import type { FormState } from "@/lib/validation";
import { keepValues } from "./keep-values";
import { Alert, Button, Field, inputClass } from "./ui";

/** "Leave us a message" on the club page: the message is e-mailed to the organisers. */
export function MessageForm({ t }: { t: Dict["club"]["message"] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(sendMessageAction, {});
  if (state.ok) return <Alert kind="success">{t.sent}</Alert>;
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Field label={t.name} name="name" errors={fe.name} hint={t.nameHint}>
        <input id="name" name="name" maxLength={100} autoComplete="name" className={inputClass} />
      </Field>
      <Field label={t.email} name="email" errors={fe.email} hint={t.emailHint}>
        <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
      </Field>
      <Field label={t.text} name="text" errors={fe.text}>
        <textarea id="text" name="text" rows={5} required className={inputClass} />
      </Field>
      <div className="hidden" aria-hidden>
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <Button type="submit" disabled={pending}>{pending ? t.submitting : t.submit}</Button>
      <p className="text-xs text-muted">
        {t.privacyNote}{" "}
        <Link href="/ochrana-udaju" className="underline hover:text-accent">{t.privacyLink}</Link>
      </p>
    </form>
  );
}
