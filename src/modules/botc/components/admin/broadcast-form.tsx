"use client";

import { useActionState } from "react";
import { broadcastEmailAction, type BroadcastResult } from "@/modules/botc/actions/sessions";
import type { Dict } from "@/i18n/dictionaries";
import { Alert, Button, Checkbox, Field, inputClass } from "@/components/ui";

export function BroadcastForm({
  sessionId,
  confirmedCount,
  waitlistedCount,
  t,
}: {
  sessionId: number;
  confirmedCount: number;
  waitlistedCount: number;
  t: Dict["admin"]["broadcast"];
}) {
  const [state, action, pending] = useActionState<BroadcastResult, FormData>(
    broadcastEmailAction.bind(null, sessionId),
    {},
  );
  const fe = state.fieldErrors ?? {};
  const fill = (s: string) =>
    s.replace("{sent}", String(state.sent ?? 0)).replace("{failed}", String(state.failed ?? 0));
  return (
    <form
      action={action}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        if (!confirm(t.confirm)) e.preventDefault();
      }}
    >
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && (
        <Alert kind={state.failed ? "error" : "success"}>{fill(state.failed ? t.sentFailed : t.sent)}</Alert>
      )}
      <Field label={t.subject} name="subject" errors={fe.subject}>
        <input id="subject" name="subject" required maxLength={200} className={inputClass} placeholder={t.subjectPlaceholder} />
      </Field>
      <Field label={t.message} name="message" errors={fe.message} hint={t.messageHint}>
        <textarea id="message" name="message" required rows={5} maxLength={5000} className={inputClass} />
      </Field>
      <Checkbox
        name="includeWaitlist"
        label={t.includeWaitlist.replace("{n}", String(waitlistedCount))}
        defaultChecked={false}
      />
      <Button type="submit" disabled={pending || confirmedCount + waitlistedCount === 0}>
        {pending ? t.sending : t.send.replace("{n}", String(confirmedCount))}
      </Button>
    </form>
  );
}
