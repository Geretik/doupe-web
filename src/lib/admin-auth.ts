import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { adminUsers, type AdminRole, type AdminUser } from "@/db/schema";
import { safeEqual } from "./token";
import { parseId } from "./validation";

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
  if (!safeEqual(sig, expected)) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  const userId = parseId(id);
  // every cookie lives MAX_AGE, so the expiry also tells when it was issued
  return userId ? { userId, issuedAt: Number(exp) - MAX_AGE } : null;
}

/** Bootstrap password from the environment; only used to create the very first account. */
export function checkBootstrapPassword(input: string) {
  const password = process.env.ADMIN_PASSWORD;
  return Boolean(password) && safeEqual(input, password!);
}

/** The signed-in organiser, or null. Looked up once per request (layout and page both ask). */
export const getAdmin = cache(async (): Promise<AdminUser | null> => {
  if (!process.env.ADMIN_SECRET) return null;
  const cookie = parseCookie((await cookies()).get(COOKIE)?.value);
  if (!cookie) return null;
  const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, cookie.userId) });
  if (!user) return null;
  // a password change or reset, or "log out on all other devices", logs out every other device
  for (const at of [user.passwordChangedAt, user.sessionsRevokedAt]) {
    if (at && cookie.issuedAt < Math.floor(at.getTime() / 1000)) return null;
  }
  return user;
});

/**
 * Signed-in organiser with at least `role`; anyone else goes to the login page (or to the admin home
 * when the role is missing). Every protected page calls it itself: the layout's check does not stop
 * a page from rendering, e.g. on client-side navigation.
 */
export async function requireAdmin(role: AdminRole = "organizer"): Promise<AdminUser> {
  const user = await getAdmin();
  if (!user) redirect("/admin/login");
  if (!hasRole(user, role)) redirect("/admin");
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
