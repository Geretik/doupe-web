"use server";

import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/db";
import { adminInvites, adminUsers, passwordResets } from "@/db/schema";
import {
  checkBootstrapPassword,
  clearAdminCookie,
  requireAdmin,
  setAdminCookie,
} from "@/lib/admin-auth";
import {
  claimLoginLink,
  countAdminUsers,
  createInvite,
  createLoginLink,
  createPasswordReset,
  getOpenInvite,
  getOpenPasswordReset,
  RESET_EMAIL_HOURS,
} from "@/lib/admin-users";
import { logAction } from "@/lib/admin-log";
import { throttleLinkRequest } from "@/lib/link-throttle";
import { LOGIN_WINDOW_MINUTES, startLoginAttempt } from "@/lib/login-limit";
import { hashPassword, verifyPassword } from "@/lib/password";
import { sendLoginLinkEmail, sendPasswordResetEmail } from "@/lib/email";
import { getDict } from "@/i18n/server";
import { inviteUrl, loginLinkUrl, passwordResetUrl } from "@/lib/site";
import { accountSchema, changePasswordSchema, emailSchema, fieldErrorsOf, inviteSchema, newPasswordSchema, type FormState } from "@/lib/validation";

export type SimpleResult = { ok?: boolean; message?: string };

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
  await logAction(user, "account.login", { method: "password" });
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
  await logAction(user, "account.login", { method: "setup" });
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
  await logAction(user, "account.login", { method: "invite" });
  redirect("/admin");
}

export type InviteResult = FormState & { url?: string };

export async function createInviteAction(_prev: InviteResult, formData: FormData): Promise<InviteResult> {
  const me = await requireAdmin("admin");
  const { t } = await getDict();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: t.admin.errors.checkForm, fieldErrors: fieldErrorsOf(parsed.error) };
  const invite = await createInvite(me.id, parsed.data.role, parsed.data.note);
  await logAction(me, "account.inviteCreate", { role: invite.role, note: invite.note });
  revalidatePath("/admin/ucty");
  return { ok: true, url: inviteUrl(invite.token) };
}

export async function revokeInviteAction(id: number) {
  const me = await requireAdmin("admin");
  const [revoked] = await db
    .delete(adminInvites)
    .where(and(eq(adminInvites.id, id), isNull(adminInvites.usedAt)))
    .returning({ role: adminInvites.role, note: adminInvites.note });
  if (revoked) await logAction(me, "account.inviteRevoke", revoked);
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
  await logAction(me, "account.delete", { account: { id: target.id, nickname: target.nickname, role: target.role } });
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
  await logAction(me, "account.password", {});
  return { ok: true };
}

/** Whether the e-mails about each session come to the signed-in organiser, unless chosen otherwise at the session. */
export async function setSessionEmailsDefaultAction(enabled: boolean): Promise<SimpleResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  if (typeof enabled !== "boolean") return {};
  await db.update(adminUsers).set({ sessionEmails: enabled }).where(eq(adminUsers.id, me.id));
  await logAction(me, "account.sessionEmails", { enabled });
  revalidatePath("/admin/profil");
  return { ok: true, message: enabled ? t.admin.emails.defaultOn : t.admin.emails.defaultOff };
}

export type ResetLinkResult = SimpleResult & { url?: string };

/** Administrator makes a one-time link for an organiser who forgot their password. */
export async function createPasswordResetAction(userId: number): Promise<ResetLinkResult> {
  const me = await requireAdmin("admin");
  const target = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, userId) });
  if (!target) return {};
  const reset = await createPasswordReset(target.id);
  await logAction(me, "account.resetLink", { account: { id: target.id, nickname: target.nickname } });
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

/**
 * "Log in with a link from an e-mail" on the login page: e-mails a one-time login link to the account's address.
 * Like the forgotten password, the answer and its timing are the same whether an account exists or not.
 */
export async function requestLoginLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { locale, t } = await getDict();
  const parsed = emailSchema(t.admin.errors).safeParse(formData.get("email"));
  if (!parsed.success) return { error: t.admin.errors.checkForm, fieldErrors: { email: [t.admin.errors.invalidEmail] } };
  const email = parsed.data;
  const throttled = await throttleLinkRequest("admin_login", email);
  if (throttled === "network") return { error: t.errors.tooManyLinks };
  if (!throttled) {
    after(async () => {
      const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });
      if (!user) return;
      const link = await createLoginLink(user.id);
      try {
        await sendLoginLinkEmail(user, loginLinkUrl(link.token), locale);
      } catch (e) {
        console.error("Login link e-mail failed", e);
      }
    });
  }
  return { ok: true };
}

/**
 * The button behind an e-mailed login link: logs this device in and uses the link up. Not on opening the link,
 * which mail scanners do on their own. A link no longer valid lands back on its page, which says so.
 */
export async function loginWithLinkAction(token: string) {
  const userId = await claimLoginLink(token);
  if (!userId) redirect(`/admin/odkaz/${encodeURIComponent(token)}`);
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, userId));
  await setAdminCookie(userId);
  await logAction(userId, "account.login", { method: "link" });
  redirect("/admin");
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
  await logAction(open.user, "account.login", { method: "reset" });
  redirect("/admin");
}

async function setPassword(userId: number, password: string) {
  await db
    .update(adminUsers)
    .set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date() })
    .where(eq(adminUsers.id, userId));
}
