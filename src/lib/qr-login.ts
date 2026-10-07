import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { userAgentFromString } from "next/server";
import { db } from "@/db";
import { adminUsers, qrLogins } from "@/db/schema";
import { setAdminCookie } from "./admin-auth";
import { clientIpHash } from "./client-ip";
import { safeEqual } from "./token";
import { parseId } from "./validation";

/** How long a QR code can be approved; the device asks for a new one after that. */
export const QR_LOGIN_MINUTES = 3;
/** New codes one network may ask for within QR_LOGIN_MINUTES (a page left open asks again only on a tap). */
const QR_LOGIN_LIMIT = 20;
/** After the approval the device has this long to pick the login up. */
const CLAIM_GRACE_MS = 60_000;
const COOKIE = "botc_qr_login";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** "Chrome · Android (tablet)": the asking device as the approving organiser sees it. */
function describeDevice(ua: string | null) {
  const { browser, os, device } = userAgentFromString(ua ?? undefined);
  const name = [browser.name, os.name].filter(Boolean).join(" · ") || "?";
  return device.type ? `${name} (${device.type})` : name;
}

/**
 * A new QR login for this device: the token for the QR code, and the secret that only this device holds (in a
 * cookie), so a photo of the code logs nobody in. Null when the network asked for too many codes.
 */
export async function startQrLogin(): Promise<{ token: string } | null> {
  const ipHash = await clientIpHash();
  if (ipHash) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(qrLogins)
      .where(and(eq(qrLogins.ipHash, ipHash), gt(qrLogins.createdAt, new Date(Date.now() - QR_LOGIN_MINUTES * 60_000))));
    if (n >= QR_LOGIN_LIMIT) return null;
  }
  const token = randomBytes(24).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + QR_LOGIN_MINUTES * 60_000);
  const [row] = await db
    .insert(qrLogins)
    .values({ token, deviceKeyHash: sha256(secret), device: describeDevice((await headers()).get("user-agent")), ipHash, expiresAt })
    .returning({ id: qrLogins.id });
  (await cookies()).set(COOKIE, `${row.id}.${secret}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: QR_LOGIN_MINUTES * 60 + CLAIM_GRACE_MS / 1000,
  });
  return { token };
}

export type QrLoginStatus = "pending" | "done" | "expired";

/** The device asks whether its code was approved; when it was, it is logged in as the organiser who approved it. */
export async function claimQrLogin(): Promise<QrLoginStatus> {
  const jar = await cookies();
  const [id, secret] = (jar.get(COOKIE)?.value ?? "").split(".");
  const rowId = parseId(id ?? "");
  if (!rowId || !secret) return "expired";
  const row = await db.query.qrLogins.findFirst({ where: eq(qrLogins.id, rowId) });
  if (!row || !safeEqual(sha256(secret), row.deviceKeyHash) || row.usedAt) return "expired";
  const now = Date.now();
  if (!row.approvedBy) return row.expiresAt.getTime() > now ? "pending" : "expired";
  if (row.expiresAt.getTime() + CLAIM_GRACE_MS < now) return "expired";
  // once only, also when the device asks twice at the same moment
  const [used] = await db
    .update(qrLogins)
    .set({ usedAt: new Date() })
    .where(and(eq(qrLogins.id, row.id), isNull(qrLogins.usedAt)))
    .returning({ id: qrLogins.id });
  if (!used) return "expired";
  jar.delete(COOKIE);
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, row.approvedBy));
  await setAdminCookie(row.approvedBy);
  return "done";
}

/** A code the organiser may still approve: known, not expired, not approved yet. */
export async function openQrLogin(token: string) {
  const row = await db.query.qrLogins.findFirst({ where: eq(qrLogins.token, token) });
  return row && !row.approvedAt && row.expiresAt.getTime() > Date.now() ? row : null;
}

/** The signed-in organiser approves the code: its device will be logged in as them. False when it no longer can be. */
export async function approveQrLogin(token: string, userId: number) {
  const [row] = await db
    .update(qrLogins)
    .set({ approvedBy: userId, approvedAt: new Date() })
    .where(and(eq(qrLogins.token, token), isNull(qrLogins.approvedAt), gt(qrLogins.expiresAt, new Date())))
    .returning({ id: qrLogins.id });
  return !!row;
}

/** Run by the daily cron: codes long past their time. */
export async function deleteOldQrLogins() {
  await db.delete(qrLogins).where(lt(qrLogins.expiresAt, new Date(Date.now() - 864e5)));
}
