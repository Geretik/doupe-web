import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminInvites, adminUsers, passwordResets, type AdminRole } from "@/db/schema";

export const INVITE_DAYS = 7;
/** Links an administrator makes for someone. Keep in sync with scripts/reset-link.mjs */
export const RESET_DAYS = 3;
/** Links e-mailed from "forgot password" on the login page; admin.forgot.sent in dictionaries.ts says it too. */
export const RESET_EMAIL_HOURS = 2;

export async function countAdminUsers() {
  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(adminUsers);
  return c;
}

export async function listAdminUsers() {
  return db.select().from(adminUsers).orderBy(asc(adminUsers.createdAt));
}

/** Open invites (unused and not expired), newest first. */
export async function listOpenInvites() {
  return db
    .select()
    .from(adminInvites)
    .where(and(isNull(adminInvites.usedAt), gt(adminInvites.expiresAt, new Date())))
    .orderBy(desc(adminInvites.createdAt));
}

export async function createInvite(createdBy: number, role: AdminRole, note: string | null) {
  const token = randomBytes(24).toString("base64url");
  const [invite] = await db
    .insert(adminInvites)
    .values({
      token,
      role,
      note,
      createdBy,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5),
    })
    .returning();
  return invite;
}

/** A usable invite for the token, or null when unknown, used or expired. */
export async function getOpenInvite(token: string) {
  const invite = await db.query.adminInvites.findFirst({ where: eq(adminInvites.token, token) });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) return null;
  return invite;
}

/** A new one-time link for setting a password; older unused links for the account stop working. */
export async function createPasswordReset(userId: number, validForMs = RESET_DAYS * 864e5) {
  await db.delete(passwordResets).where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
  // both times from one clock: with the database's now() as created_at the link was valid a millisecond less now and then
  const createdAt = new Date();
  const [reset] = await db
    .insert(passwordResets)
    .values({ token: randomBytes(24).toString("base64url"), userId, createdAt, expiresAt: new Date(createdAt.getTime() + validForMs) })
    .returning();
  return reset;
}

/** A usable reset link with its account, or null when unknown, used or expired. */
export async function getOpenPasswordReset(token: string) {
  const [row] = await db
    .select({ reset: passwordResets, user: adminUsers })
    .from(passwordResets)
    .innerJoin(adminUsers, eq(adminUsers.id, passwordResets.userId))
    .where(and(eq(passwordResets.token, token), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())));
  return row ?? null;
}
