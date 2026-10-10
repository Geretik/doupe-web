"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { attendanceAction, forgetAttendanceAction, type AttendanceIntent, type AttendanceState } from "@/app/actions/attendance";
import type { Dict } from "@/i18n/dictionaries";
import { keepValues } from "./keep-values";
import { Alert, Card, Field, inputClass } from "./ui";

type FormMode = Exclude<AttendanceIntent, "checkin">;
type Affiliation = keyof Dict["attendance"]["affiliations"];
/** Who this phone remembers; the key stays in the cookie, the page never gets it. */
export type RememberedView = { firstName: string; lastName: string; affiliation: Affiliation };

const linkButton = "text-sm font-medium text-accent underline-offset-2 hover:underline";
/** A big button for a thumb */
const bigButton =
  "w-full rounded-xl bg-accent px-6 py-3.5 text-lg font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Tonight's attendance sheet on the phone: one tap for the person it remembers, a form for anyone else.
 * The server re-renders the page after every entry (the cookie changes), so `remembered` and `recordedAt` are fresh.
 */
export function AttendanceSheet({
  t,
  affiliations,
  remembered,
  recordedAt,
}: {
  t: Dict["attendance"]["form"];
  affiliations: Dict["attendance"]["affiliations"];
  remembered: RememberedView | null;
  /** "17:42": when tonight's entry from this phone was made */
  recordedAt: string | null;
}) {
  const [state, action, pending] = useActionState<AttendanceState, FormData>(attendanceAction, {});
  // a form opened by a button after the last answer; a new answer closes it, unless it failed – then its form stays open
  const [opened, setOpened] = useState<{ mode: FormMode | null; after: AttendanceState } | null>(null);
  const [forgetting, startForget] = useTransition();
  const fresh = opened?.after !== state;
  const failedMode = !state.ok && state.intent && state.intent !== "checkin" ? state.intent : null;
  const chosen = opened && !fresh ? opened.mode : failedMode;
  // nobody remembered and nothing just recorded: the form is all there is
  const mode: FormMode | null = chosen ?? (!remembered && !(fresh && state.ok) ? "new" : null);
  const open = (m: FormMode | null) => setOpened({ mode: m, after: state });
  const notMe = () => {
    open("new");
    startForget(() => forgetAttendanceAction());
  };
  const message = fresh && state.message ? <Alert kind="success">{state.message}</Alert> : null;
  const error = fresh && state.error ? <Alert kind="error">{state.error}</Alert> : null;

  if (mode) {
    return (
      <PersonForm
        key={mode}
        mode={mode}
        t={t}
        defaults={mode === "correct" ? remembered : null}
        state={fresh ? state : {}}
        action={action}
        pending={pending}
        onBack={remembered && mode !== "new" ? () => open(null) : null}
      />
    );
  }

  const links = (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
      {remembered && (
        <button type="button" onClick={() => open("correct")} className={linkButton}>
          {t.correct}
        </button>
      )}
      <button type="button" onClick={() => open(remembered ? "other" : "new")} className={linkButton}>
        {t.someoneElse}
      </button>
      {remembered && (
        <button type="button" onClick={notMe} disabled={forgetting} className={linkButton}>
          {t.notMe}
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4" data-testid="attendance-sheet">
      {message}
      {error}
      {remembered && (
        <Card className="flex flex-col items-center gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">
              {remembered.firstName} {remembered.lastName}
            </p>
            <p className="text-muted">{affiliations[remembered.affiliation]}</p>
          </div>
          {recordedAt ? (
            <p className="text-lg font-semibold text-green-800 dark:text-green-300" data-testid="attendance-recorded">
              ✓ {t.hereSince} {recordedAt}
            </p>
          ) : (
            <form action={action} className="w-full">
              <input type="hidden" name="intent" value="checkin" />
              <button type="submit" disabled={pending} className={bigButton} data-testid="attendance-checkin">
                {pending ? t.submitting : t.checkIn}
              </button>
            </form>
          )}
        </Card>
      )}
      {links}
      <PrivacyNote t={t} />
    </div>
  );
}

function PersonForm({
  mode,
  t,
  defaults,
  state,
  action,
  pending,
  onBack,
}: {
  mode: FormMode;
  t: Dict["attendance"]["form"];
  defaults: RememberedView | null;
  state: AttendanceState;
  action: (formData: FormData) => void;
  pending: boolean;
  onBack: (() => void) | null;
}) {
  const fe = state.fieldErrors ?? {};
  const title = mode === "correct" ? t.correctTitle : mode === "other" ? t.someoneElse : null;
  const hint = mode === "correct" ? t.correctHint : mode === "other" ? t.someoneElseHint : t.intro;
  const submit = mode === "correct" ? t.save : mode === "other" ? t.submitOther : t.submit;
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4" data-testid={`attendance-form-${mode}`}>
      <input type="hidden" name="intent" value={mode} />
      <div>
        {title && <h2 className="text-lg font-semibold">{title}</h2>}
        <p className="text-muted">{hint}</p>
      </div>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Field label={t.firstName} name="firstName" errors={fe.firstName}>
        <input id="firstName" name="firstName" required maxLength={100} autoComplete={mode === "other" ? "off" : "given-name"} defaultValue={defaults?.firstName} className={inputClass} />
      </Field>
      <Field label={t.lastName} name="lastName" errors={fe.lastName}>
        <input id="lastName" name="lastName" required maxLength={100} autoComplete={mode === "other" ? "off" : "family-name"} defaultValue={defaults?.lastName} className={inputClass} />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t.affiliation}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(t.answers) as Affiliation[]).map((a) => (
            <label
              key={a}
              className="flex cursor-pointer items-center justify-center gap-3 rounded-lg border border-border bg-card px-3 py-3 text-lg has-[:checked]:border-accent has-[:checked]:bg-accent/10"
            >
              <input type="radio" name="affiliation" value={a} required defaultChecked={defaults?.affiliation === a} className="h-4 w-4 accent-accent" />
              {t.answers[a]}
            </label>
          ))}
        </div>
        {fe.affiliation?.map((e) => (
          <p key={e} className="mt-1 text-xs text-accent">
            {e}
          </p>
        ))}
      </fieldset>
      {mode === "new" && (
        <label className="flex items-start gap-3 text-sm">
          <input name="remember" type="checkbox" defaultChecked className="mt-0.5 h-4 w-4 accent-accent" />
          <span>
            {t.remember}
            <span className="block text-xs text-muted">{t.rememberHint}</span>
          </span>
        </label>
      )}
      <div className="hidden" aria-hidden>
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <button type="submit" disabled={pending} className={bigButton}>
        {pending ? t.submitting : submit}
      </button>
      {onBack && (
        <button type="button" onClick={onBack} className={`${linkButton} self-center`}>
          {t.back}
        </button>
      )}
      <PrivacyNote t={t} />
    </form>
  );
}

function PrivacyNote({ t }: { t: Dict["attendance"]["form"] }) {
  return (
    <p className="text-center text-xs text-muted">
      {t.privacyNote}{" "}
      <Link href="/ochrana-udaju" className="underline hover:text-accent">
        {t.privacyLink}
      </Link>
    </p>
  );
}
