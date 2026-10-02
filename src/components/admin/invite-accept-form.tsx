"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "@/app/actions/admin";
import type { Dict } from "@/i18n/dictionaries";
import type { FormState } from "@/lib/validation";
import { keepValues } from "../keep-values";
import { Alert, Button } from "../ui";
import { AccountFields } from "./account-fields";

export function InviteAcceptForm({ token, t }: { token: string; t: Dict["admin"]["invite"] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInviteAction.bind(null, token), {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <AccountFields t={t} fe={fe} />
      <Button type="submit" disabled={pending}>{pending ? t.submitting : t.submit}</Button>
    </form>
  );
}
