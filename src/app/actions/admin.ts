"use server";

import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, notLike, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/db";
import { adminInvites, adminUsers, gamePlayers, games, passwordResets, registrations, sessions, tables, type RegistrationState } from "@/db/schema";
import {
  checkBootstrapPassword,
  clearAdminCookie,
  requireAdmin,
  setAdminCookie,
} from "@/lib/admin-auth";
import { countAdminUsers, createInvite, createPasswordReset, getOpenInvite, getOpenPasswordReset, RESET_EMAIL_HOURS } from "@/lib/admin-users";
import { throttleLinkRequest } from "@/lib/link-throttle";
import { LOGIN_WINDOW_MINUTES, startLoginAttempt } from "@/lib/login-limit";
import { rotateFeedKey } from "@/lib/org-feed";
import { hashPassword, verifyPassword } from "@/lib/password";
import { announceSessionOnDiscord } from "@/lib/discord";
import { sendBroadcastEmail, sendConfirmationEmail, sendExistingRegistrationEmail, sendPasswordResetEmail, sendPromotedEmail, sendTableEmail } from "@/lib/email";
import { autoAssign, createTables, listTables } from "@/lib/tables";
import { sendDueReminders } from "@/lib/reminders";
import { getDict } from "@/i18n/server";
import { inviteUrl, passwordResetUrl } from "@/lib/site";
import { generateEditToken } from "@/lib/token";
import { addPragueDays, pragueLocalToDate } from "@/lib/time";
import {
  accountSchema,
  broadcastSchema,
  changePasswordSchema,
  emailSchema,
  fieldErrorsOf,
  gameSchema,
  inviteSchema,
  newPasswordSchema,
  repeatSchema,
  parsePlaylist,
  parseRoster,
  parseScripts,
  quickRegistrationSchema,
  sessionSchema,
  type FormState,
} from "@/lib/validation";
import { promoteWaitlist } from "@/lib/waitlist";
import { ANON_SUFFIX, erasedFields, hasEmail, isErased, noEmailAddress, playerPseudonym } from "@/lib/retention";

/** Sessions are evenings: arrival and departure are picked as times of day, so a session must stay under a day. */
const MAX_SESSION_HOURS = 24;

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { t } = await getDict();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const attempt = await startLoginAttempt();
  if (attempt.blocked) return { error: t.admin.errors.tooManyLogins(LOGIN_WINDOW_MINUTES) };
  const user = email ? await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) }) : undefined;
  // verify against a dummy hash when the user is unknown so timing does not reveal valid e-mails
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return { error: t.admin.errors.wrongLogin };
  await attempt.succeeded();
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
  // the bootstrap password is as guessable as a login, so it shares the login limit
  const attempt = await startLoginAttempt();
  if (attempt.blocked) return { error: e.tooManyLogins(LOGIN_WINDOW_MINUTES) };
  const bootstrap = String(formData.get("bootstrapPassword") ?? "");
  if (!checkBootstrapPassword(bootstrap)) {
    // Say what arrived (length + short fingerprint of the typed value) so a browser autofill or a stray
    // space is visible; compare with `printf %s "$ADMIN_PASSWORD" | sha256sum | cut -c1-6`. Nothing about
    // the server's password is shown – before the first account exists, anyone can open this page.
    const received = `${bootstrap.length} / ${createHash("sha256").update(bootstrap).digest("hex").slice(0, 6)}`;
    return { error: `${e.wrongBootstrap} (${e.received}: ${received})`, fieldErrors: { bootstrapPassword: [e.wrongBootstrap] } };
  }
  await attempt.succeeded();
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
  const deleted = await db.transaction(async (tx) => {
    // Lock every administrator first: two administrators deleting each other at once must not both
    // succeed and leave the club without one (the second waits, then sees the first one gone).
    const admins = await tx.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.role, "admin")).for("update");
    if (target.role === "admin" && !admins.some((a) => a.id !== id)) return false;
    await tx.delete(adminUsers).where(eq(adminUsers.id, id));
    return true;
  });
  if (!deleted) return { message: t.admin.errors.cannotDeleteLastAdmin };
  revalidatePath("/admin/ucty");
  return { ok: true };
}

export async function logoutAction() {
  await clearAdminCookie();
  redirect("/");
}

/** Signed-in organiser changes their own password; other devices get logged out. */
export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const e = t.admin.errors;
  const parsed = changePasswordSchema(e).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: e.checkForm, fieldErrors: fieldErrorsOf(parsed.error) };
  // the current password is as guessable as the login, so it counts towards the same limit
  const attempt = await startLoginAttempt();
  if (attempt.blocked) return { error: e.tooManyLogins(LOGIN_WINDOW_MINUTES) };
  if (!(await verifyPassword(parsed.data.currentPassword, me.passwordHash))) {
    return { error: e.wrongCurrentPassword, fieldErrors: { currentPassword: [e.wrongCurrentPassword] } };
  }
  await attempt.succeeded();
  await setPassword(me.id, parsed.data.password);
  // this device stays signed in with a fresh cookie
  await setAdminCookie(me.id);
  return { ok: true };
}

export type ResetLinkResult = SimpleResult & { url?: string };

/** Administrator makes a one-time link for an organiser who forgot their password. */
export async function createPasswordResetAction(userId: number): Promise<ResetLinkResult> {
  await requireAdmin("admin");
  const target = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, userId) });
  if (!target) return {};
  const reset = await createPasswordReset(target.id);
  return { ok: true, url: passwordResetUrl(reset.token) };
}

/**
 * "Forgot password" on the login page: e-mails a one-time link to the account's address. Always answers
 * the same and sends after the answer, so neither the text nor the timing tells whether an account exists.
 */
export async function requestPasswordResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { locale, t } = await getDict();
  const parsed = emailSchema(t.admin.errors).safeParse(formData.get("email"));
  if (!parsed.success) return { error: t.admin.errors.checkForm, fieldErrors: { email: [t.admin.errors.invalidEmail] } };
  const email = parsed.data;
  const throttled = await throttleLinkRequest("admin_reset", email);
  if (throttled === "network") return { error: t.errors.tooManyLinks };
  if (!throttled) {
    after(async () => {
      const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });
      if (!user) return;
      const reset = await createPasswordReset(user.id, RESET_EMAIL_HOURS * 3600_000);
      try {
        await sendPasswordResetEmail(user, passwordResetUrl(reset.token), locale);
      } catch (e) {
        console.error("Password reset e-mail failed", e);
      }
    });
  }
  return { ok: true };
}

/** Sets a new password from a reset link and logs that organiser in. */
export async function resetPasswordAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDict();
  const e = t.admin.errors;
  const open = await getOpenPasswordReset(token);
  if (!open) return { error: e.resetInvalid };
  const parsed = newPasswordSchema(e).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: e.checkForm, fieldErrors: fieldErrorsOf(parsed.error) };
  // claim the link first; the where clause makes a double submit fail instead of using it twice
  const [used] = await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.id, open.reset.id), isNull(passwordResets.usedAt)))
    .returning({ id: passwordResets.id });
  if (!used) return { error: e.resetInvalid };
  await setPassword(open.user.id, parsed.data.password);
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, open.user.id));
  await setAdminCookie(open.user.id);
  redirect("/admin");
}

async function setPassword(userId: number, password: string) {
  await db
    .update(adminUsers)
    .set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date() })
    .where(eq(adminUsers.id, userId));
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
  if (endsAt.getTime() - startsAt.getTime() >= MAX_SESSION_HOURS * 3600_000) {
    return { error: { endsAt: [e.sessionTooLong(MAX_SESSION_HOURS)] }, message: e.checkForm };
  }
  const scripts = parseScripts(formData, e);
  if (scripts.error) return { error: { scripts: scripts.error }, message: e.checkForm };
  const playlist = parsePlaylist(formData.get("playlist"));
  if (playlist.error) return { error: { playlist: [e.playlistInvalid] }, message: e.checkForm };
  let registrationOpensAt: Date | null = null;
  if (parsed.data.registrationState !== "open" && parsed.data.registrationOpensAt) {
    registrationOpensAt = pragueLocalToDate(parsed.data.registrationOpensAt);
    if (!registrationOpensAt) return { error: { registrationOpensAt: [e.invalidOpensAt] }, message: e.checkForm };
    if (registrationOpensAt <= new Date()) return { error: { registrationOpensAt: [e.opensAtPast] }, message: e.checkForm };
    if (registrationOpensAt >= endsAt) return { error: { registrationOpensAt: [e.opensAtAfterEnd] }, message: e.checkForm };
  }
  return {
    values: {
      scripts: scripts.scripts,
      playlist: playlist.playlist,
      title: parsed.data.title,
      place: parsed.data.place,
      capacity: parsed.data.capacity,
      gameLanguage: parsed.data.gameLanguage,
      arrivalMode: parsed.data.arrivalMode,
      phoneRequired: parsed.data.phoneRequired,
      registrationState: parsed.data.registrationState,
      registrationOpensAt,
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
    // the same Prague time each week, also across a daylight-saving change
    const days = i * weeks * 7;
    const opensAt = r.values.registrationOpensAt;
    return {
      ...r.values,
      startsAt: addPragueDays(r.values.startsAt, days),
      endsAt: addPragueDays(r.values.endsAt, days),
      registrationOpensAt: opensAt && addPragueDays(opensAt, days),
    };
  });
  const [created] = await db.insert(sessions).values(rows).returning();
  if (formData.get("announceDiscord") === "on") {
    await announceSessionOnDiscord(created, created.capacity);
  }
  revalidatePath("/botc");
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
  const [before] = await db.select({ startsAt: sessions.startsAt }).from(sessions).where(eq(sessions.id, id));
  if (!before) return { error: (await getDict()).t.admin.errors.noSession };
  const moved = before.startsAt.getTime() !== r.values.startsAt.getTime();
  // a moved session gets its reminders and "spots left" post again, for the new date
  await db.update(sessions).set({ ...r.values, ...(moved ? { spotsPostedAt: null } : {}) }).where(eq(sessions.id, id));
  if (moved) await db.update(registrations).set({ reminderSentAt: null }).where(eq(registrations.sessionId, id));
  // a bigger capacity may make room for waitlisted players
  await promoteWaitlist(id);
  revalidateSession(id);
  return { ok: true };
}

export async function deleteSessionAction(id: number) {
  await requireAdmin();
  await db.delete(sessions).where(eq(sessions.id, id));
  revalidatePath("/botc");
  redirect("/admin");
}

function revalidateSession(sessionId: number) {
  revalidatePath("/botc");
  revalidatePath(`/botc/termin/${sessionId}`);
  revalidatePath(`/admin/termin/${sessionId}`);
}

export async function adminCancelRegistrationAction(registrationId: number) {
  await requireAdmin();
  const now = new Date();
  const [row] = await db
    .update(registrations)
    // the reason of an earlier cancellation by the player does not apply to this one
    .set({ status: "cancelled", waitlistedAt: null, cancelledAt: now, cancelReason: null, tableId: null, updatedAt: now })
    .where(and(eq(registrations.id, registrationId), inArray(registrations.status, ["confirmed", "waitlisted"])))
    .returning({ sessionId: registrations.sessionId });
  if (row) {
    await promoteWaitlist(row.sessionId);
    revalidateSession(row.sessionId);
  }
}

/** One-click "open" / "pause" of new sign-ups from the admin session page. */
export async function setRegistrationStateAction(sessionId: number, state: RegistrationState): Promise<SimpleResult> {
  await requireAdmin();
  const { t } = await getDict();
  // a manual switch replaces any scheduled opening
  await db.update(sessions).set({ registrationState: state, registrationOpensAt: null }).where(eq(sessions.id, sessionId));
  revalidateSession(sessionId);
  return { ok: true, message: state === "open" ? t.admin.session.registrationOpened : t.admin.session.registrationPaused };
}

/**
 * Right to erasure on request: deletes everything personal in all the player's sign-ups and cancels the
 * ones for sessions that are not over yet. Sign-ups are matched by e-mail – including the older ones
 * whose e-mail the daily cron already replaced by the player's pseudonym.
 */
export async function adminErasePlayerAction(registrationId: number): Promise<SimpleResult> {
  await requireAdmin();
  const { t } = await getDict();
  const reg = await db.query.registrations.findFirst({ where: eq(registrations.id, registrationId) });
  if (!reg) return { message: t.errors.regNotFound };
  if (isErased(reg.email)) return { ok: true, message: t.admin.session.erased(0) };
  const now = new Date();
  // the same for the address and for its stand-in, so it also works from an already anonymised sign-up
  const pseudonym = playerPseudonym(reg.email);
  const candidates = await db
    .select({ id: registrations.id, email: registrations.email, status: registrations.status, sessionId: registrations.sessionId, endsAt: sessions.endsAt })
    .from(registrations)
    .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
    // anonymised rows by their pseudonym; the rest (recent and upcoming sessions only) are compared below
    .where(or(eq(registrations.email, pseudonym), notLike(registrations.email, `%${ANON_SUFFIX}`)));
  const rows = candidates.filter((r) => r.email === pseudonym || playerPseudonym(r.email) === pseudonym);
  const freed = new Set<number>();
  for (const r of rows) {
    const active = r.status !== "cancelled" && r.endsAt >= now;
    await db
      .update(registrations)
      .set({
        ...erasedFields(),
        ...(active ? { status: "cancelled" as const, waitlistedAt: null, cancelledAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(registrations.id, r.id));
    if (active) freed.add(r.sessionId);
  }
  for (const id of freed) await promoteWaitlist(id);
  for (const id of new Set(rows.map((r) => r.sessionId))) revalidateSession(id);
  return { ok: true, message: t.admin.session.erased(rows.length) };
}

/** Restores a cancelled registration: into a free spot, or onto the waitlist when full. */
export async function adminRestoreRegistrationAction(registrationId: number) {
  await requireAdmin();
  const row = await db.transaction(async (tx) => {
    const reg = await tx.query.registrations.findFirst({
      where: eq(registrations.id, registrationId),
    });
    // only a cancelled one (a double click must not move the restored player to the end of the waitlist),
    // and not one erased at the player's request
    if (!reg || reg.status !== "cancelled" || isErased(reg.email)) return null;
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
        cancelledAt: null,
        cancelReason: null,
        updatedAt: now,
      })
      .where(and(eq(registrations.id, registrationId), eq(registrations.status, "cancelled")));
    return reg;
  });
  if (row) revalidateSession(row.sessionId);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * After an organiser seated a player beyond the free spots: raises the capacity to the number of confirmed
 * players (one more spot), so nobody is over the limit and the waitlist keeps its place. Run it in the
 * transaction that locked the session row. Returns the new capacity, or null when it did not change.
 */
async function fitCapacity(tx: Tx, sessionId: number, capacity: number) {
  const [{ c }] = await tx
    .select({ c: sql<number>`count(*)::int` })
    .from(registrations)
    .where(and(eq(registrations.sessionId, sessionId), eq(registrations.status, "confirmed")));
  if (c <= capacity) return null;
  await tx.update(sessions).set({ capacity: c }).where(eq(sessions.id, sessionId));
  return c;
}

/** Seats a waitlisted player right away – one more spot when the session is full – and e-mails them as when a spot opens up. */
export async function adminConfirmWaitlistedAction(registrationId: number) {
  await requireAdmin();
  const result = await db.transaction(async (tx) => {
    const reg = await tx.query.registrations.findFirst({ where: eq(registrations.id, registrationId) });
    if (!reg) return null;
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, reg.sessionId)).for("update");
    if (!session) return null;
    const now = new Date();
    const notify = session.endsAt > now && hasEmail(reg.email);
    const [row] = await tx
      .update(registrations)
      .set({
        status: "confirmed",
        waitlistedAt: null,
        updatedAt: now,
        // claim the send – exactly one e-mail, as with an automatic promotion
        ...(notify && { confirmationSentAt: now, lastEmailAt: now }),
      })
      .where(and(eq(registrations.id, registrationId), eq(registrations.status, "waitlisted")))
      .returning();
    if (!row) return null;
    await fitCapacity(tx, session.id, session.capacity);
    return { session, row, notify };
  });
  if (!result) return;
  if (result.notify) {
    try {
      await sendPromotedEmail(result.row, result.session);
    } catch (e) {
      console.error("Promotion e-mail could not be sent", e);
      await db.update(registrations).set({ confirmationSentAt: null }).where(eq(registrations.id, result.row.id));
    }
  }
  revalidateSession(result.session.id);
}

export type QuickRegisterResult = FormState & { message?: string };

/**
 * An organiser adds a player on the spot (only the nickname is needed). The player is confirmed ahead of
 * the waitlist; a full session gets one more spot. With an e-mail they get the usual confirmation.
 */
export async function adminQuickRegisterAction(
  sessionId: number,
  _prev: QuickRegisterResult,
  formData: FormData,
): Promise<QuickRegisterResult> {
  await requireAdmin();
  const { locale, t } = await getDict();
  const e = t.admin.errors;
  const parsed = quickRegistrationSchema(t.errors).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: e.checkForm, fieldErrors: fieldErrorsOf(parsed.error) };
  const { email, ...data } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).for("update");
    if (!session) return { kind: "not_found" as const };
    if (email) {
      const existing = await tx.query.registrations.findFirst({
        where: and(eq(registrations.sessionId, sessionId), eq(sql`lower(${registrations.email})`, email)),
      });
      if (existing) return { kind: "taken" as const, cancelled: existing.status === "cancelled" };
    }
    const now = new Date();
    const notify = email !== null && session.endsAt > now;
    const [registration] = await tx
      .insert(registrations)
      .values({
        ...data,
        note: data.note ?? null,
        sessionId,
        email: email ?? noEmailAddress(),
        status: "confirmed",
        locale,
        // claim the confirmation send – exactly one e-mail
        confirmationSentAt: notify ? now : null,
        lastEmailAt: notify ? now : null,
        editToken: generateEditToken(),
      })
      .returning();
    const capacity = await fitCapacity(tx, sessionId, session.capacity);
    return { kind: "created" as const, session, registration, capacity, notify };
  });

  if (result.kind === "not_found") return { error: e.noSession };
  if (result.kind === "taken") {
    return { error: e.checkForm, fieldErrors: { email: [result.cancelled ? e.quickEmailCancelled : e.quickEmailTaken] } };
  }
  let emailFailed = false;
  if (result.notify) {
    try {
      await sendConfirmationEmail(result.registration, result.session);
    } catch (err) {
      console.error("Confirmation e-mail could not be sent", err);
      emailFailed = true;
      await db
        .update(registrations)
        .set({ confirmationSentAt: null, lastEmailAt: null })
        .where(eq(registrations.id, result.registration.id));
    }
  }
  revalidateSession(sessionId);
  const s = t.admin.session;
  return {
    ok: true,
    message: [
      s.quickAdded(result.registration.nickname),
      result.capacity !== null && s.quickCapacityRaised(result.capacity),
      result.notify && (emailFailed ? s.quickEmailFailed : s.quickEmailSent),
    ]
      .filter(Boolean)
      .join(" "),
  };
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
    if (!hasEmail(reg.email)) continue;
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

/** New secret link to the signed-in organiser's calendar feed; calendars subscribed to the old one stop updating. */
export async function rotateFeedKeyAction(): Promise<SimpleResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  await rotateFeedKey(me.id);
  revalidatePath("/admin");
  return { ok: true, message: t.admin.list.orgCalendarRotated };
}

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
      if (!hasEmail(reg.email)) continue;
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

/**
 * Stores who played what in a game. Only the players in the form are touched, and only players of the
 * game's session count; an empty select removes what was entered for that player.
 */
async function saveRoster(tx: Tx, gameId: number, sessionId: number, roster: Map<number, string | null | undefined>) {
  const ids = [...roster.keys()];
  if (ids.length === 0) return;
  const ofSession = await tx
    .select({ id: registrations.id })
    .from(registrations)
    .where(and(eq(registrations.sessionId, sessionId), inArray(registrations.id, ids)));
  await tx.delete(gamePlayers).where(and(eq(gamePlayers.gameId, gameId), inArray(gamePlayers.registrationId, ids)));
  const rows = ofSession.flatMap(({ id }) => {
    const role = roster.get(id);
    return role === undefined ? [] : [{ gameId, registrationId: id, role }];
  });
  if (rows.length > 0) await tx.insert(gamePlayers).values(rows);
}

export async function addGameAction(sessionId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const { t } = await getDict();
  const parsed = gameSchema(t.admin.errors).safeParse(Object.fromEntries(formData.entries()));
  const roster = parseRoster(formData);
  if (!parsed.success || !roster) {
    return { error: t.admin.errors.checkForm, fieldErrors: parsed.success ? undefined : fieldErrorsOf(parsed.error) };
  }
  await db.transaction(async (tx) => {
    const [game] = await tx.insert(games).values({ sessionId, ...parsed.data }).returning({ id: games.id });
    await saveRoster(tx, game.id, sessionId, roster);
  });
  revalidatePath(`/admin/termin/${sessionId}`);
  revalidatePath("/botc/archiv");
  return { ok: true };
}

export async function updateGameAction(gameId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const { t } = await getDict();
  const parsed = gameSchema(t.admin.errors).safeParse(Object.fromEntries(formData.entries()));
  const roster = parseRoster(formData);
  if (!parsed.success || !roster) {
    return { error: t.admin.errors.checkForm, fieldErrors: parsed.success ? undefined : fieldErrorsOf(parsed.error) };
  }
  const row = await db.transaction(async (tx) => {
    const [game] = await tx.update(games).set(parsed.data).where(eq(games.id, gameId)).returning({ sessionId: games.sessionId });
    if (game) await saveRoster(tx, gameId, game.sessionId, roster);
    return game;
  });
  if (!row) return { error: t.admin.errors.noGame };
  revalidatePath(`/admin/termin/${row.sessionId}`);
  revalidatePath("/botc/archiv");
  return { ok: true };
}

export async function deleteGameAction(gameId: number) {
  await requireAdmin();
  const [row] = await db.delete(games).where(eq(games.id, gameId)).returning({ sessionId: games.sessionId });
  if (row) {
    revalidatePath(`/admin/termin/${row.sessionId}`);
    revalidatePath("/botc/archiv");
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
