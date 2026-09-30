"use client";

import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { Field, inputClass } from "../ui";

type PasswordLabels = {
  password: string;
  passwordHint: string;
  passwordAgain: string;
};

type Labels = PasswordLabels & {
  nickname: string;
  email: string;
  emailHint: string;
};

/** Nickname, e-mail and password twice – shared by the first-account setup and the invitation form. */
export function AccountFields({ t, fe }: { t: Labels; fe: Record<string, string[] | undefined> }) {
  return (
    <>
      <Field label={t.nickname} name="nickname" errors={fe.nickname}>
        <input id="nickname" name="nickname" required maxLength={100} autoComplete="nickname" className={inputClass} />
      </Field>
      <Field label={t.email} name="email" errors={fe.email} hint={t.emailHint}>
        <input id="email" name="email" type="email" required maxLength={200} autoComplete="email" className={inputClass} />
      </Field>
      <PasswordFields t={t} fe={fe} />
    </>
  );
}

/** New password twice – also used on its own for changing and resetting a password. */
export function PasswordFields({ t, fe }: { t: PasswordLabels; fe: Record<string, string[] | undefined> }) {
  return (
    <>
      <Field label={t.password} name="password" errors={fe.password} hint={t.passwordHint.replace("{n}", String(PASSWORD_MIN_LENGTH))}>
        <input id="password" name="password" type="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" className={inputClass} />
      </Field>
      <Field label={t.passwordAgain} name="passwordAgain" errors={fe.passwordAgain}>
        <input id="passwordAgain" name="passwordAgain" type="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" className={inputClass} />
      </Field>
    </>
  );
}
