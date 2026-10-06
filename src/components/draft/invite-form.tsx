"use client";

import { useActionState } from "react";
import type { MessageState } from "@/app/actions/draft";
import { Alert, Button, inputClass } from "../ui";

/**
 * Invites accounts to one session: tick who, choose the role and whether they draft. It stays on the page when
 * everybody is invited, so the answer to the last invitation is still shown.
 */
export function DraftInviteForm({
  action,
  accounts,
  t,
}: {
  action: (prev: MessageState, formData: FormData) => Promise<MessageState>;
  accounts: { id: number; nickname: string }[];
  t: { hint: string; none: string; role: string; roles: { participant: string; organizer: string }; drafts: string; submit: string; submitting: string };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3" data-testid="draft-invite">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert kind="success">{state.message}</Alert>}
      {accounts.length === 0 ? (
        <p className="text-sm text-muted">{t.none}</p>
      ) : (
        <>
          <p className="text-xs text-muted">{t.hint}</p>
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="userId" value={a.id} className="h-4 w-4 accent-accent" />
                {a.nickname}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              {t.role}
              <select name="role" defaultValue="participant" className={inputClass}>
                <option value="participant">{t.roles.participant}</option>
                <option value="organizer">{t.roles.organizer}</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="drafts" defaultChecked className="h-4 w-4 accent-accent" />
              {t.drafts}
            </label>
            <Button type="submit" disabled={pending}>{pending ? t.submitting : t.submit}</Button>
          </div>
        </>
      )}
    </form>
  );
}
