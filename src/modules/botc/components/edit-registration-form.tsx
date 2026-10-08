"use client";

import { useActionState, useState } from "react";
import {
  cancelRegistrationAction,
  updateRegistrationAction,
} from "@/modules/botc/actions/registration";
import type { ArrivalMode, Registration } from "@/db/schema";
import type { Dict } from "@/i18n/dictionaries";
import type { FormState } from "@/lib/validation";
import { keepValues } from "@/components/keep-values";
import { TimeSelect } from "./time-select";
import { Alert, Button, Checkbox, Field, inputClass } from "@/components/ui";

export function EditRegistrationForm({
  registration: r,
  defaultArrival,
  defaultDeparture,
  arrivalMode = "times",
  phoneRequired = false,
  t,
}: {
  registration: Registration;
  defaultArrival: string;
  defaultDeparture: string;
  arrivalMode?: ArrivalMode;
  phoneRequired?: boolean;
  t: Dict["form"];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateRegistrationAction.bind(null, r.editToken),
    {},
  );
  const [cancelState, setCancelState] = useState<FormState | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [reason, setReason] = useState("");

  async function onCancel() {
    setCancelling(true);
    const res = await cancelRegistrationAction(r.editToken, reason);
    setCancelState(res);
    setCancelling(false);
  }

  if (cancelState?.ok) {
    return <Alert kind="success">{t.cancelled}</Alert>;
  }

  const fe = state.fieldErrors ?? {};

  return (
    <div className="flex flex-col gap-6">
      <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4">
        {state.error && <Alert kind="error">{state.error}</Alert>}
        {state.ok && <Alert kind="success">{t.saved}</Alert>}
        {cancelState?.error && <Alert kind="error">{cancelState.error}</Alert>}
        <Field label={t.nickname} name="nickname" errors={fe.nickname} hint={t.nicknameHintEdit}>
          <input id="nickname" name="nickname" required defaultValue={r.nickname} className={inputClass} />
        </Field>
        {r.email && (
          <Field label={t.email} name="email">
            <input id="email" value={r.email} disabled className={`${inputClass} opacity-60`} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${t.firstName} (${t.optional})`} name="firstName" errors={fe.firstName}>
            <input id="firstName" name="firstName" defaultValue={r.firstName ?? ""} className={inputClass} />
          </Field>
          <Field label={`${t.lastName} (${t.optional})`} name="lastName" errors={fe.lastName}>
            <input id="lastName" name="lastName" defaultValue={r.lastName ?? ""} className={inputClass} />
          </Field>
        </div>
        <Field label={phoneRequired ? t.phone : `${t.phone} (${t.optional})`} name="phone" errors={fe.phone} hint={t.phoneHint}>
          <input id="phone" name="phone" type="tel" required={phoneRequired} defaultValue={r.phone ?? ""} className={inputClass} autoComplete="tel" placeholder="+420 777 123 456" />
        </Field>
        {arrivalMode === "late" && <Checkbox name="arrivesLate" label={t.arrivesLate} hint={t.arrivesLateHint} defaultChecked={r.arrivesLate} />}
        {arrivalMode === "times" && <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.arrival} name="arrivalTime" errors={fe.arrivalTime}>
            <TimeSelect
              id="arrivalTime"
              name="arrivalTime"
              start={defaultArrival}
              end={defaultDeparture}
              defaultValue={r.arrivalTime}
              defaultLabel={t.arrivalDefault.replace("{t}", defaultArrival)}
            />
          </Field>
          <Field label={t.departure} name="departureTime" errors={fe.departureTime}>
            <TimeSelect
              id="departureTime"
              name="departureTime"
              start={defaultArrival}
              end={defaultDeparture}
              defaultValue={r.departureTime}
              defaultLabel={t.departureDefault.replace("{t}", defaultDeparture)}
            />
          </Field>
        </div>}
        <Checkbox name="canStorytell" label={t.canStorytell} hint={t.canStorytellHint} defaultChecked={r.canStorytell} />
        <Checkbox name="isNewbie" label={t.isNewbie} hint={t.isNewbieHint} defaultChecked={r.isNewbie} />
        <Field label={t.note} name="note" errors={fe.note} hint={t.noteHint}>
          <textarea id="note" name="note" rows={2} maxLength={500} defaultValue={r.note ?? ""} className={inputClass} />
        </Field>
        {!confirmingCancel && (
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? t.saving : t.save}
            </Button>
            <Button type="button" variant="danger" onClick={() => setConfirmingCancel(true)}>
              {t.cancel}
            </Button>
          </div>
        )}
      </form>
      {confirmingCancel && (
        <div className="flex flex-col gap-3 rounded-xl border border-accent/40 bg-accent/5 p-4" data-testid="cancel-panel">
          <p className="font-medium">{t.cancelConfirm}</p>
          <Field label={t.cancelReason} name="cancelReason" hint={t.cancelReasonHint}>
            <textarea
              id="cancelReason"
              name="cancelReason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="danger" onClick={onCancel} disabled={cancelling}>
              {cancelling ? t.cancelling : t.cancelYes}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirmingCancel(false)} disabled={cancelling}>
              {t.cancelNo}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
