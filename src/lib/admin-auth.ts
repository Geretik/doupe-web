import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { adminUsers, type AdminRole, type AdminUser } from "@/db/schema";

const COOKIE = "botc_admin";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.ADMIN_SECRET;
  if (!s) throw new Error("ADMIN_SECRET is not set.");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** The cookie is "<user id>.<expiry unix seconds>.<hmac>" – stateless, no session table needed. */
function parseCookie(value: string | undefined): { userId: number; issuedAt: number } | null {
  if (!value) return null;
  const [id, exp, sig] = value.split(".");
  if (!id || !exp || !sig) return null;
  const expected = sign(`${id}.${exp}`);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  const userId = Number(id);
  // every cookie lives MAX_AGE, so the expiry also tells when it was issued
  return Number.isInteger(userId) ? { userId, issuedAt: Number(exp) - MAX_AGE } : null;
}

/** Bootstrap password from the environment; only used to create the very first account. */
export function checkBootstrapPassword(input: string) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(password);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The signed-in organiser, or null. */
export async function getAdmin(): Promise<AdminUser | null> {
  if (!process.env.ADMIN_SECRET) return null;
  const cookie = parseCookie((await cookies()).get(COOKIE)?.value);
  if (!cookie) return null;
  const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, cookie.userId) });
  if (!user) return null;
  // a password change or reset logs out every other device
  if (user.passwordChangedAt && cookie.issuedAt < Math.floor(user.passwordChangedAt.getTime() / 1000)) return null;
  return user;
}

export async function isAdmin() {
  return (await getAdmin()) !== null;
}

export function hasRole(user: AdminUser | null, role: AdminRole) {
  if (!user) return false;
  return role === "organizer" || user.role === "admin";
}

export async function setAdminCookie(userId: number) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${userId}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearAdminCookie() {
  (await cookies()).delete(COOKIE);
}
