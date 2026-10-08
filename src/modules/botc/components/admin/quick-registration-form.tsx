"use client";

import { useActionState, useRef } from "react";
import { adminQuickRegisterAction, type QuickRegisterResult } from "@/modules/botc/actions/sessions";
import { keepValues } from "@/components/keep-values";
import { Alert, Button, Field, inputClass } from "@/components/ui";

export type QuickRegistrationLabels = {
  hint: string;
  /** Shown when the next player raises the capacity */
  full: string | null;
  nickname: string;
  email: string;
  emailHint: string;
  phone: string;
  optional: string;
  more: string;
  firstName: string;
  lastName: string;
  note: string;
  storyteller: string;
  newbie: string;
  submit: string;
  submitting: string;
};

/** Organiser adds a player on the spot: the nickname is enough; the form empties after each added player. */
export function QuickRegistrationForm({ sessionId, t }: { sessionId: number; t: QuickRegistrationLabels }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<QuickRegisterResult, FormData>(async (prev, formData) => {
    const result = await adminQuickRegisterAction(sessionId, prev, formData);
    if (result.ok) formRef.current?.reset();
    return result;
  }, {});
  const fe = state.fieldErrors ?? {};
  // the session form on the same page has its own #nickname-like ids
  const id = (name: string) => `quick-${name}`;
  const optional = (label: string) => `${label} (${t.optional})`;
  return (
    <form ref={formRef} action={action} onSubmit={keepValues(action)} className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t.hint}</p>
      {t.full && <Alert kind="info">{t.full}</Alert>}
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert kind="success">{state.message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t.nickname} name={id("nickname")} errors={fe.nickname}>
          <input id={id("nickname")} name="nickname" required maxLength={100} autoComplete="off" className={inputClass} />
        </Field>
        <Field label={optional(t.email)} name={id("email")} errors={fe.email} hint={t.emailHint}>
          <input id={id("email")} name="email" type="email" maxLength={200} autoComplete="off" className={inputClass} />
        </Field>
        <Field label={optional(t.phone)} name={id("phone")} errors={fe.phone}>
          <input id={id("phone")} name="phone" type="tel" maxLength={30} autoComplete="off" className={inputClass} />
        </Field>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">{t.more}</summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.firstName} name={id("firstName")} errors={fe.firstName}>
              <input id={id("firstName")} name="firstName" maxLength={100} autoComplete="off" className={inputClass} />
            </Field>
            <Field label={t.lastName} name={id("lastName")} errors={fe.lastName}>
              <input id={id("lastName")} name="lastName" maxLength={100} autoComplete="off" className={inputClass} />
            </Field>
          </div>
          <Field label={t.note} name={id("note")} errors={fe.note}>
            <input id={id("note")} name="note" maxLength={500} autoComplete="off" className={inputClass} />
          </Field>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2">
              <input id={id("canStorytell")} name="canStorytell" type="checkbox" className="h-4 w-4 accent-accent" />
              🎩 {t.storyteller}
            </label>
            <label className="flex items-center gap-2">
              <input id={id("isNewbie")} name="isNewbie" type="checkbox" className="h-4 w-4 accent-accent" />
              🌱 {t.newbie}
            </label>
          </div>
        </div>
      </details>
      <div>
        <Button type="submit" disabled={pending}>{pending ? t.submitting : t.submit}</Button>
      </div>
    </form>
  );
}
