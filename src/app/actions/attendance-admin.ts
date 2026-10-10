"use server";

import { revalidatePath } from "next/cache";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { logAction } from "@/lib/admin-log";
import { deleteEntry, parseDay, recordAttendance } from "@/lib/attendance";
import { formatTime } from "@/lib/time";
import { attendanceSchema, fieldErrorsOf, parseId, type FormState } from "@/lib/validation";

export type AddAttendanceState = FormState & { message?: string };

/** Admin → Prezenčka: an organiser puts someone on the sheet of a night, e.g. who has no phone with them. */
export async function addAttendanceAction(_prev: AddAttendanceState, formData: FormData): Promise<AddAttendanceState> {
  const me = await requireAdmin();
  const { locale, t } = await getDict();
  const a = t.admin.attendance;
  const day = parseDay(formData.get("day"));
  const parsed = attendanceSchema(t.attendance.errors).safeParse(Object.fromEntries(formData.entries()));
  if (!day || !parsed.success) {
    return {
      error: t.errors.checkForm,
      fieldErrors: { ...(parsed.success ? {} : fieldErrorsOf(parsed.error)), ...(day ? {} : { day: [a.invalidDay] }) },
    };
  }
  const { firstName, lastName, affiliation } = parsed.data;
  const name = `${firstName} ${lastName}`;
  const outcome = await recordAttendance(day, { firstName, lastName, affiliation }, null, me.id);
  if (outcome.status !== "recorded") return { error: a.alreadyThere(name, formatTime(outcome.entry.createdAt, locale)) };
  await logAction(me, "attendance.add", { day, affiliation });
  revalidatePath("/admin/prezence");
  return { ok: true, message: a.added(name) };
}

export async function deleteAttendanceAction(formData: FormData) {
  const me = await requireAdmin();
  const id = parseId(formData.get("id"));
  const row = id ? await deleteEntry(id) : undefined;
  if (row) await logAction(me, "attendance.delete", { day: row.day, affiliation: row.affiliation });
  revalidatePath("/admin/prezence");
}
