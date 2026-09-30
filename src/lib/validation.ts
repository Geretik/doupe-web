import { z } from "zod";
import { adminRoles, arrivalModes, gameWinners, type ArrivalMode } from "@/db/schema";
import type { Dict } from "@/i18n/dictionaries";
import { PASSWORD_MIN_LENGTH } from "./password";
import { formatTime, TIME_RE } from "./time";

/** Optional "+" followed by 9–15 digits (after removing spaces, dashes and parentheses). */
export const PHONE_RE = /^\+?\d{9,15}$/;

/** Per-session switches that change what the registration form asks for. */
export type RegistrationRules = { arrivalMode: ArrivalMode; phoneRequired: boolean };

export function registrationSchema(t: Dict["errors"], rules: RegistrationRules) {
  // missing in "late" mode (the form has no time selects), empty = session start/end
  const optionalTime = z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : null))
    .pipe(z.string().regex(TIME_RE, t.timeFormat).nullable());

  const phone = z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim())
    .pipe(rules.phoneRequired ? z.string().min(1, t.fillPhone).max(30) : z.string().max(30))
    // "+420 777 123 456" → "+420777123456"
    .transform((v) => (v === "" ? null : v.replace(/[\s().-]/g, "")))
    .pipe(z.string().regex(PHONE_RE, t.invalidPhone).nullable());

  return z.object({
    nickname: z.string().trim().min(1, t.fillNickname).max(100),
    email: z.string().trim().toLowerCase().email(t.invalidEmail).max(200),
    firstName: optionalText,
    lastName: optionalText,
    phone,
    arrivalTime: rules.arrivalMode === "times" ? optionalTime : z.string().optional().transform(() => null),
    departureTime: rules.arrivalMode === "times" ? optionalTime : z.string().optional().transform(() => null),
    arrivesLate: rules.arrivalMode === "late" ? checkbox : z.string().optional().transform(() => false),
    canStorytell: checkbox,
    isNewbie: checkbox,
    note: z
      .string()
      .trim()
      .max(500)
      .transform((v) => (v === "" ? null : v))
      .optional(),
    website: z.string().max(0).optional(), // honeypot
  });
}

/** Optional free-text field: empty string becomes null. */
const optionalText = z
  .string()
  .trim()
  .max(100)
  .transform((v) => (v === "" ? null : v))
  .optional();

/** <input type="checkbox"> sends "on" when checked and nothing at all otherwise. */
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");

export function broadcastSchema(t: Dict["admin"]["errors"]) {
  return z.object({
    subject: z.string().trim().min(1, t.fillSubject).max(200),
    message: z.string().trim().min(1, t.writeMessage).max(5000),
    includeWaitlist: checkbox,
  });
}

export function registrationEditSchema(t: Dict["errors"], rules: RegistrationRules) {
  return registrationSchema(t, rules).omit({ email: true, website: true });
}

export function sessionSchema(t: Dict["admin"]["errors"]) {
  return z.object({
    title: z.string().trim().min(1, t.fillTitle).max(200),
    startsAt: z.string().min(1, t.fillStart),
    endsAt: z.string().min(1, t.fillEnd),
    place: z.string().trim().min(1, t.fillPlace).max(300),
    capacity: z.coerce.number().int().min(1, t.capacityMin).max(500),
    arrivalMode: z.enum(arrivalModes).default("times"),
    phoneRequired: checkbox,
    storyteller: z
      .string()
      .trim()
      .max(200)
      .transform((v) => (v === "" ? null : v)),
    note: z
      .string()
      .trim()
      .max(2000)
      .transform((v) => (v === "" ? null : v)),
  });
}

const scriptLinkSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z
    .string()
    .trim()
    // "botcscripts.com/…" → "https://botcscripts.com/…"
    .transform((u) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`))
    .pipe(z.string().url().max(2000)),
});

/** Reads scriptName[] / scriptUrl[] pairs from a FormData, ignoring fully empty rows. */
export function parseScripts(formData: FormData, t: Dict["admin"]["errors"]) {
  const names = formData.getAll("scriptName").map(String);
  const urls = formData.getAll("scriptUrl").map(String);
  const rows = names.map((name, i) => ({ name, url: urls[i] ?? "" }));
  const filled = rows.filter((r) => r.name.trim() || r.url.trim());
  const result = z.array(scriptLinkSchema).safeParse(
    filled.map((r) => ({ name: r.name.trim() || r.url.trim(), url: r.url })),
  );
  if (!result.success) {
    const bad = result.error.issues.map((i) => Number(i.path[0]) + 1);
    return {
      error: [t.scriptUrl([...new Set(bad)].join(", "))],
    };
  }
  return { scripts: result.data };
}

/** Nickname + e-mail + password twice; shared by the first-account setup and invitation forms. */
export function accountSchema(t: Dict["admin"]["errors"]) {
  return z
    .object({
      nickname: z.string().trim().min(1, t.fillNickname).max(100),
      email: z.string().trim().toLowerCase().email(t.invalidEmail).max(200),
      password: z.string().min(PASSWORD_MIN_LENGTH, t.passwordShort(PASSWORD_MIN_LENGTH)).max(200),
      passwordAgain: z.string(),
    })
    .refine((v) => v.password === v.passwordAgain, { message: t.passwordsDiffer, path: ["passwordAgain"] });
}

/** Series of identical sessions: interval in weeks (0 = none) and total count. */
export const repeatSchema = z.object({
  repeatWeeks: z.coerce.number().int().min(0).max(8).default(0),
  repeatCount: z.coerce.number().int().min(1).max(12).default(1),
});

export function gameSchema(t: Dict["admin"]["errors"]) {
  return z.object({
    scriptName: z.string().trim().min(1, t.fillScript).max(200),
    // absent when the script was typed instead of picked
    scriptUrl: z
      .string()
      .max(2000)
      .optional()
      .transform((v) => (v?.trim() ? v.trim() : null)),
    winner: z
      .string()
      .transform((v) => (v === "" ? null : v))
      .pipe(z.enum(gameWinners).nullable()),
    players: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .pipe(z.number().int().min(5).max(20).nullable()),
    notes: z
      .string()
      .trim()
      .max(1000)
      .transform((v) => (v === "" ? null : v)),
  });
}

export const inviteSchema = z.object({
  role: z.enum(adminRoles),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === "" ? null : v)),
});

/**
 * Arrival must be inside the session, departure too, and departure after arrival.
 * Times are "HH:MM" in Prague; a session may cross midnight.
 */
export function timeRangeErrors(
  times: { arrivalTime: string | null; departureTime: string | null },
  session: { startsAt: Date; endsAt: Date },
  t: Dict["errors"],
): Record<string, string[]> | null {
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const start = toMin(formatTime(session.startsAt));
  let end = toMin(formatTime(session.endsAt));
  if (end <= start) end += 1440;
  // shift a time before the start onto the next day when the session crosses midnight
  const norm = (hhmm: string) => {
    const v = toMin(hhmm);
    return v < start && end > 1440 ? v + 1440 : v;
  };
  const errors: Record<string, string[]> = {};
  const a = times.arrivalTime ? norm(times.arrivalTime) : start;
  const d = times.departureTime ? norm(times.departureTime) : end;
  if (times.arrivalTime && (a < start || a >= end)) errors.arrivalTime = [t.timeOutOfRange];
  if (times.departureTime && (d <= start || d > end)) errors.departureTime = [t.timeOutOfRange];
  if (!errors.arrivalTime && !errors.departureTime && d <= a) errors.departureTime = [t.departureBeforeArrival];
  return Object.keys(errors).length ? errors : null;
}

export type FormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export function fieldErrorsOf(err: z.ZodError) {
  return err.flatten().fieldErrors as Record<string, string[] | undefined>;
}
