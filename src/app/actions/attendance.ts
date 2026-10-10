"use server";

import type { Dict, Locale } from "@/i18n/dictionaries";
import { getDict } from "@/i18n/server";
import {
  correctAttendance,
  forgetPerson,
  newDeviceKey,
  openNight,
  recordAttendance,
  rememberedPerson,
  rememberPerson,
  type Person,
  type RecordOutcome,
} from "@/lib/attendance";
import { throttleAttendance } from "@/lib/link-throttle";
import { formatTime } from "@/lib/time";
import { attendanceSchema, fieldErrorsOf, type FormState } from "@/lib/validation";

/**
 * What the attendance form sends: "checkin" = the person this phone remembers, one tap; "new" = someone this phone
 * does not know yet (remembered when they tick it); "correct" = the remembered person's details, tonight's entry too;
 * "other" = someone else on this phone, a friend without one, who is not remembered.
 */
export type AttendanceIntent = "checkin" | "new" | "correct" | "other";

/** `intent` of a failed submit: the form it came from stays open with its errors. */
export type AttendanceState = FormState & { message?: string; intent?: AttendanceIntent };

const intents: AttendanceIntent[] = ["checkin", "new", "correct", "other"];

function fullName(p: { firstName: string | null; lastName: string | null }) {
  return [p.firstName, p.lastName].filter(Boolean).join(" ");
}

/** The club's attendance sheet (/prezence): puts the person on the sheet of tonight's club night. */
export async function attendanceAction(_prev: AttendanceState, formData: FormData): Promise<AttendanceState> {
  const { locale, t } = await getDict();
  const a = t.attendance;
  const intent = intents.find((i) => i === formData.get("intent"));
  if (!intent) return { error: t.errors.checkForm };
  const night = openNight();
  if (!night) return { error: a.closedNow, intent };
  const me = await rememberedPerson();
  if ((intent === "checkin" || intent === "correct") && !me) return { error: a.notRemembered, intent: "new" };

  let person: Person;
  if (intent === "checkin") {
    person = { firstName: me!.firstName, lastName: me!.lastName, affiliation: me!.affiliation };
  } else {
    const parsed = attendanceSchema(a.errors).safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return { error: t.errors.checkForm, fieldErrors: fieldErrorsOf(parsed.error), intent };
    const { website, ...fields } = parsed.data;
    // honeypot hit – pretend success
    if (website) return { ok: true, message: a.recordedOther(fullName(fields)) };
    person = fields;
  }
  if (await throttleAttendance(fullName(person))) return { error: a.tooMany, intent };

  let outcome: RecordOutcome;
  if (intent === "checkin") {
    outcome = await recordAttendance(night, person, me!.key);
    await rememberPerson(me!);
  } else if (intent === "correct") {
    outcome = await correctAttendance(night, person, me!.key);
    await rememberPerson({ ...person, key: me!.key });
  } else if (intent === "other") {
    outcome = await recordAttendance(night, person, null);
  } else {
    // a new key whenever someone new is remembered: the entries of whoever this phone remembered before stay theirs
    const key = formData.get("remember") === "on" ? newDeviceKey() : null;
    outcome = await recordAttendance(night, person, key);
    if (key) await rememberPerson({ ...person, key });
    else if (me) await forgetPerson();
  }
  return { ok: true, message: outcomeMessage(outcome, intent, a, locale) };
}

function outcomeMessage(outcome: RecordOutcome, intent: AttendanceIntent, a: Dict["attendance"], locale: Locale) {
  const name = fullName(outcome.entry);
  if (outcome.status === "corrected") return a.corrected;
  if (outcome.status === "already") return a.already(name, formatTime(outcome.entry.createdAt, locale));
  return intent === "other" ? a.recordedOther(name) : a.recorded(name);
}

/** "That's not me" / "Forget": this phone stops remembering the person; their entries stay on the sheet. */
export async function forgetAttendanceAction() {
  await forgetPerson();
}
