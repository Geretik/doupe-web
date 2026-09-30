"use server";

import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { adminInvites, adminUsers, games, registrations, sessions, tables, type AdminRole, type AdminUser } from "@/db/schema";
import {
  checkBootstrapPassword,
  clearAdminCookie,
  getAdmin,
  hasRole,
  setAdminCookie,
} from "@/lib/admin-auth";
import { countAdminUsers, createInvite, getOpenInvite } from "@/lib/admin-users";
import { hashPassword, verifyPassword } from "@/lib/password";
import { announceSessionOnDiscord } from "@/lib/discord";
import { sendBroadcastEmail, sendExistingRegistrationEmail, sendTableEmail } from "@/lib/email";
import { autoAssign, createTables, listTables } from "@/lib/tables";
import { sendDueReminders } from "@/lib/reminders";
import { getDict } from "@/i18n/server";
import { inviteUrl } from "@/lib/site";
import { pragueLocalToDate } from "@/lib/time";
import {
  accountSchema,
  broadcastSchema,
  fieldErrorsOf,
  gameSchema,
  inviteSchema,
  repeatSchema,
  parseScripts,
  sessionSchema,
  type FormState,
} from "@/lib/validation";
import { promoteWaitlist } from "@/lib/waitlist";

/** Signed-in organiser (any role); redirects to the login page otherwise. */
async function requireAdmin(role: AdminRole = "organizer"): Promise<AdminUser> {
  const user = await getAdmin();
  if (!user) redirect("/admin/login");
  if (!hasRole(user, role)) redirect("/admin");
  return user;
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { t } = await getDict();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = email ? await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) }) : undefined;
  // verify against a dummy hash when the user is unknown so timing does not reveal valid e-mails
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return { error: t.admin.errors.wrongLogin };
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
  await setAdminCookie(user.id);
  redirect("/admin");
}

const DUMMY_HASH = "scrypt$16384$00000000000000000000000000000000$" + "0".repeat(128);

/** Creates the very first account; guarded by the ADMIN_PASSWORD environment variable. */
export async function setupFirstAdminAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { t } = await getDict();
  const e = t.admin.errors;
  if ((await countAdminUsers()) > 0) return { error: e.setupDone };
  const bootstrap = String(formData.get("bootstrapPassword") ?? "");
  if (!checkBootstrapPassword(bootstrap)) {
    // say what arrived (length + short fingerprint, never the value) so a browser autofill or a stray space is visible
    const received = `${bootstrap.length} / ${createHash("sha256").update(bootstrap).digest("hex").slice(0, 6)}`;
    return { error: `${e.wrongBootstrap} (${e.received}: ${received})`, fieldErrors: { bootstrapPassword: [e.wrongBootstrap] } };
  }
  const parsed = accountSchema(e).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: e.checkForm, fieldErrors: fieldErrorsOf(parsed.error) };
  const [user] = await db
    .insert(adminUsers)
    .values({
      nickname: parsed.data.nickname,
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      role: "admin",
      lastLoginAt: new Date(),
    })
    .returning();
  await setAdminCookie(user.id);
  redirect("/admin");
}

/** Creates an account from an invitation link and logs the new organiser in. */
export async function acceptInviteAction(
  token: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { t } = await getDict();
  const e = t.admin.errors;
  const invite = await getOpenInvite(token);
  if (!invite) return { error: e.inviteInvalid };
  const parsed = accountSchema(e).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: e.checkForm, fieldErrors: fieldErrorsOf(parsed.error) };
  const taken = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, parsed.data.email) });
  if (taken) return { error: e.emailTaken, fieldErrors: { email: [e.emailTaken] } };
  const passwordHash = await hashPassword(parsed.data.password);
  const user = await db.transaction(async (tx) => {
    // mark the invite used first; the where clause makes a double submit fail instead of creating two accounts
    const [used] = await tx
      .update(adminInvites)
      .set({ usedAt: new Date() })
      .where(and(eq(adminInvites.id, invite.id), isNull(adminInvites.usedAt)))
      .returning({ id: adminInvites.id });
    if (!used) return null;
    const [created] = await tx
      .insert(adminUsers)
      .values({
        nickname: parsed.data.nickname,
        email: parsed.data.email,
        passwordHash,
        role: invite.role,
        lastLoginAt: new Date(),
      })
      .returning();
    await tx.update(adminInvites).set({ usedBy: created.id }).where(eq(adminInvites.id, invite.id));
    return created;
  });
  if (!user) return { error: e.inviteInvalid };
  await setAdminCookie(user.id);
  redirect("/admin");
}

export type InviteResult = FormState & { url?: string };

export async function createInviteAction(_prev: InviteResult, formData: FormData): Promise<InviteResult> {
  const me = await requireAdmin("admin");
  const { t } = await getDict();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: t.admin.errors.checkForm, fieldErrors: fieldErrorsOf(parsed.error) };
  const invite = await createInvite(me.id, parsed.data.role, parsed.data.note);
  revalidatePath("/admin/ucty");
  return { ok: true, url: inviteUrl(invite.token) };
}

export async function revokeInviteAction(id: number) {
  await requireAdmin("admin");
  await db.delete(adminInvites).where(and(eq(adminInvites.id, id), isNull(adminInvites.usedAt)));
  revalidatePath("/admin/ucty");
}

export async function deleteAdminUserAction(id: number): Promise<SimpleResult> {
  const me = await requireAdmin("admin");
  const { t } = await getDict();
  if (id === me.id) return { message: t.admin.errors.cannotDeleteSelf };
  const target = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, id) });
  if (!target) return { ok: true };
  if (target.role === "admin") {
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(adminUsers)
      .where(eq(adminUsers.role, "admin"));
    if (c <= 1) return { message: t.admin.errors.cannotDeleteLastAdmin };
  }
  await db.delete(adminUsers).where(eq(adminUsers.id, id));
  revalidatePath("/admin/ucty");
  return { ok: true };
}

export async function logoutAction() {
  await clearAdminCookie();
  redirect("/");
}

async function parseSessionForm(formData: FormData) {
  const { t } = await getDict();
  const e = t.admin.errors;
  const parsed = sessionSchema(e).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: fieldErrorsOf(parsed.error), message: e.checkForm };
  }
  const startsAt = pragueLocalToDate(parsed.data.startsAt);
  const endsAt = pragueLocalToDate(parsed.data.endsAt);
  if (!startsAt) return { error: { startsAt: [e.invalidStart] }, message: e.checkForm };
  if (!endsAt) return { error: { endsAt: [e.invalidEnd] }, message: e.checkForm };
  if (endsAt <= startsAt) return { error: { endsAt: [e.endAfterStart] }, message: e.checkForm };
  const scripts = parseScripts(formData, e);
  if (scripts.error) return { error: { scripts: scripts.error }, message: e.checkForm };
  return {
    values: {
      scripts: scripts.scripts,
      title: parsed.data.title,
      place: parsed.data.place,
      capacity: parsed.data.capacity,
      arrivalMode: parsed.data.arrivalMode,
      phoneRequired: parsed.data.phoneRequired,
      storyteller: parsed.data.storyteller,
      note: parsed.data.note,
      startsAt,
      endsAt,
    },
  };
}

export async function createSessionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const r = await parseSessionForm(formData);
  if (r.error) return { error: r.message, fieldErrors: r.error };
  // optional series: the same session every N weeks, `repeatCount` times in total
  const repeat = repeatSchema.safeParse(Object.fromEntries(formData.entries()));
  const weeks = repeat.success ? repeat.data.repeatWeeks : 0;
  const count = repeat.success && weeks > 0 ? repeat.data.repeatCount : 1;
  const rows = Array.from({ length: count }, (_, i) => {
    const shift = i * weeks * 7 * 864e5;
    return { ...r.values, startsAt: new Date(r.values.startsAt.getTime() + shift), endsAt: new Date(r.values.endsAt.getTime() + shift) };
  });
  const [created] = await db.insert(sessions).values(rows).returning();
  if (formData.get("announceDiscord") === "on") {
    await announceSessionOnDiscord(created, created.capacity);
  }
  revalidatePath("/");
  redirect("/admin");
}

export async function updateSessionAction(
  id: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const r = await parseSessionForm(formData);
  if (r.error) return { error: r.message, fieldErrors: r.error };
  await db.update(sessions).set(r.values).where(eq(sessions.id, id));
  // a bigger capacity may make room for waitlisted players
  await promoteWaitlist(id);
  revalidatePath("/");
  revalidatePath(`/termin/${id}`);
  return { ok: true };
}

export async function deleteSessionAction(id: number) {
  await requireAdmin();
  await db.delete(sessions).where(eq(sessions.id, id));
  revalidatePath("/");
  redirect("/admin");
}

function revalidateSession(sessionId: number) {
  revalidatePath("/");
  revalidatePath(`/termin/${sessionId}`);
  revalidatePath(`/admin/termin/${sessionId}`);
}

export async function adminCancelRegistrationAction(registrationId: number) {
  await requireAdmin();
  const [row] = await db
    .update(registrations)
    .set({ status: "cancelled", waitlistedAt: null, updatedAt: new Date() })
    .where(eq(registrations.id, registrationId))
    .returning({ sessionId: registrations.sessionId });
  if (row) {
    await promoteWaitlist(row.sessionId);
    revalidateSession(row.sessionId);
  }
}

/** Restores a cancelled registration: into a free spot, or onto the waitlist when full. */
export async function adminRestoreRegistrationAction(registrationId: number) {
  await requireAdmin();
  const row = await db.transaction(async (tx) => {
    const reg = await tx.query.registrations.findFirst({
      where: eq(registrations.id, registrationId),
    });
    if (!reg) return null;
    const [session] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.id, reg.sessionId))
      .for("update");
    const [{ confirmed, waitlisted }] = await tx
      .select({
        confirmed: sql<number>`count(*) filter (where ${registrations.status} = 'confirmed')::int`,
        waitlisted: sql<number>`count(*) filter (where ${registrations.status} = 'waitlisted')::int`,
      })
      .from(registrations)
      .where(eq(registrations.sessionId, reg.sessionId));
    const full = confirmed >= session.capacity || waitlisted > 0;
    const now = new Date();
    await tx
      .update(registrations)
      .set({
        status: full ? "waitlisted" : "confirmed",
        waitlistedAt: full ? now : null,
        updatedAt: now,
      })
      .where(eq(registrations.id, registrationId));
    return reg;
  });
  if (row) revalidateSession(row.sessionId);
}

/** Admin override: confirms a waitlisted player even beyond capacity. */
export async function adminConfirmWaitlistedAction(registrationId: number) {
  await requireAdmin();
  const [row] = await db
    .update(registrations)
    .set({ status: "confirmed", waitlistedAt: null, updatedAt: new Date() })
    .where(and(eq(registrations.id, registrationId), eq(registrations.status, "waitlisted")))
    .returning({ sessionId: registrations.sessionId });
  if (row) revalidateSession(row.sessionId);
}

/** Marks attendance: true = came, false = no-show, null = not marked. */
export async function setAttendanceAction(registrationId: number, attended: boolean | null) {
  await requireAdmin();
  const [row] = await db
    .update(registrations)
    .set({ attended, updatedAt: new Date() })
    .where(eq(registrations.id, registrationId))
    .returning({ sessionId: registrations.sessionId });
  if (row) revalidatePath(`/admin/termin/${row.sessionId}`);
}

/** E-mails a player the link to their registration again (also marks a failed confirmation as sent). */
export async function adminResendLinkAction(registrationId: number): Promise<SimpleResult> {
  await requireAdmin();
  const { t } = await getDict();
  const reg = await db.query.registrations.findFirst({
    where: eq(registrations.id, registrationId),
    with: { session: true },
  });
  if (!reg) return { message: t.admin.errors.noSession };
  try {
    await sendExistingRegistrationEmail(reg, reg.session);
  } catch (e) {
    console.error("Resend link failed", e);
    return { ok: false, message: t.admin.errors.linkFailed };
  }
  const now = new Date();
  await db
    .update(registrations)
    .set({ lastEmailAt: now, confirmationSentAt: reg.confirmationSentAt ?? now })
    .where(eq(registrations.id, registrationId));
  revalidatePath(`/admin/termin/${reg.sessionId}`);
  return { ok: true, message: t.admin.errors.linkSent };
}

export type BroadcastResult = FormState & { sent?: number; failed?: number };

export async function broadcastEmailAction(
  sessionId: number,
  _prev: BroadcastResult,
  formData: FormData,
): Promise<BroadcastResult> {
  await requireAdmin();
  const { t } = await getDict();
  const parsed = broadcastSchema(t.admin.errors).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: t.admin.errors.checkForm, fieldErrors: fieldErrorsOf(parsed.error) };
  }
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) return { error: t.admin.errors.noSession };
  const statuses: ("confirmed" | "waitlisted")[] = parsed.data.includeWaitlist
    ? ["confirmed", "waitlisted"]
    : ["confirmed"];
  const recipients = await db.query.registrations.findMany({
    where: and(eq(registrations.sessionId, sessionId), inArray(registrations.status, statuses)),
  });
  let sent = 0;
  let failed = 0;
  for (const reg of recipients) {
    try {
      await sendBroadcastEmail(reg, session, parsed.data.subject, parsed.data.message);
      sent++;
    } catch (e) {
      console.error("Broadcast e-mail failed", e);
      failed++;
    }
  }
  if (sent > 0) {
    await db
      .update(registrations)
      .set({ lastEmailAt: new Date() })
      .where(and(eq(registrations.sessionId, sessionId), inArray(registrations.status, statuses)));
  }
  return { ok: true, sent, failed };
}

export type SimpleResult = { ok?: boolean; message?: string };

export async function createTablesAction(sessionId: number, count: number) {
  await requireAdmin();
  await createTables(sessionId, Math.min(6, Math.max(2, count)));
  await autoAssign(sessionId);
  revalidatePath(`/admin/termin/${sessionId}`);
}

export async function autoAssignTablesAction(sessionId: number) {
  await requireAdmin();
  await autoAssign(sessionId);
  revalidatePath(`/admin/termin/${sessionId}`);
}

export async function clearTablesAction(sessionId: number) {
  await requireAdmin();
  await db.delete(tables).where(eq(tables.sessionId, sessionId));
  revalidatePath(`/admin/termin/${sessionId}`);
}

export async function assignTableAction(registrationId: number, tableId: number | null) {
  await requireAdmin();
  const [row] = await db
    .update(registrations)
    .set({ tableId })
    .where(eq(registrations.id, registrationId))
    .returning({ sessionId: registrations.sessionId });
  if (row) revalidatePath(`/admin/termin/${row.sessionId}`);
}

export async function setTableStorytellerAction(tableId: number, formData: FormData) {
  await requireAdmin();
  const storyteller = String(formData.get("storyteller") ?? "").trim().slice(0, 200) || null;
  const [row] = await db.update(tables).set({ storyteller }).where(eq(tables.id, tableId)).returning({ sessionId: tables.sessionId });
  if (row) revalidatePath(`/admin/termin/${row.sessionId}`);
}

/** E-mails every assigned player their table number and table mates. */
export async function sendTablesEmailAction(sessionId: number): Promise<SimpleResult> {
  await requireAdmin();
  const { t } = await getDict();
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) return { message: t.admin.errors.noSession };
  const list = await listTables(sessionId);
  let sent = 0;
  let failed = 0;
  for (const table of list) {
    for (const reg of table.players) {
      const mates = table.players.filter((p) => p.id !== reg.id).map((p) => p.nickname);
      try {
        await sendTableEmail(reg, session, table, mates);
        sent++;
      } catch (e) {
        console.error("Table e-mail failed", e);
        failed++;
      }
    }
    await db.update(tables).set({ notifiedAt: new Date() }).where(eq(tables.id, table.id));
  }
  if (sent > 0) {
    await db
      .update(registrations)
      .set({ lastEmailAt: new Date() })
      .where(and(eq(registrations.sessionId, sessionId), eq(registrations.status, "confirmed")));
  }
  revalidatePath(`/admin/termin/${sessionId}`);
  return { ok: failed === 0, message: t.admin.session.tablesSent(sent, failed) };
}

export async function addGameAction(sessionId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const { t } = await getDict();
  const parsed = gameSchema(t.admin.errors).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: t.admin.errors.checkForm, fieldErrors: fieldErrorsOf(parsed.error) };
  await db.insert(games).values({ sessionId, ...parsed.data });
  revalidatePath(`/admin/termin/${sessionId}`);
  revalidatePath("/archiv");
  return { ok: true };
}

export async function deleteGameAction(gameId: number) {
  await requireAdmin();
  const [row] = await db.delete(games).where(eq(games.id, gameId)).returning({ sessionId: games.sessionId });
  if (row) {
    revalidatePath(`/admin/termin/${row.sessionId}`);
    revalidatePath("/archiv");
  }
}

export async function sendRemindersNowAction(sessionId: number): Promise<SimpleResult> {
  await requireAdmin();
  const { t } = await getDict();
  const r = await sendDueReminders({ sessionId, ignoreWindow: true });
  revalidatePath(`/admin/termin/${sessionId}`);
  if (r.due === 0) return { ok: true, message: t.admin.errors.remindersAllSent };
  return { ok: r.failed === 0, message: t.admin.errors.remindersSent(r.sent, r.failed) };
}

export async function announceDiscordAction(sessionId: number): Promise<SimpleResult> {
  await requireAdmin();
  const { t } = await getDict();
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) return { message: t.admin.errors.noSession };
  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(registrations)
    .where(and(eq(registrations.sessionId, sessionId), eq(registrations.status, "confirmed")));
  const result = await announceSessionOnDiscord(session, Math.max(0, session.capacity - c));
  return {
    ok: result === "sent",
    message: {
      sent: t.admin.errors.discordSent,
      not_configured: t.admin.errors.discordNotConfigured,
      failed: t.admin.errors.discordFailed,
    }[result],
  };
}
