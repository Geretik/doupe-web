"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { getAdmin, requireAdmin, setAdminCookie } from "@/lib/admin-auth";
import { logAction } from "@/lib/admin-log";
import { qrSvg } from "@/lib/qr";
import { approveQrLogin, claimQrLogin, startQrLogin, type QrLoginStatus } from "@/lib/qr-login";
import { qrLoginUrl } from "@/lib/site";

/** `image`: the QR code as an SVG data URL; `url`: what it opens */
export type QrLoginCode = { image: string; url: string } | { error: "tooMany" };

/** The login page shows a QR code that a signed-in organiser's phone approves (see lib/qr-login). */
export async function startQrLoginAction(): Promise<QrLoginCode> {
  const started = await startQrLogin();
  if (!started) return { error: "tooMany" };
  const url = qrLoginUrl(started.token);
  const image = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await qrSvg(url))}`;
  return { image, url };
}

/** Asked by the login page every few seconds; "done" = this device is now logged in. */
export async function pollQrLoginAction(): Promise<QrLoginStatus> {
  return claimQrLogin();
}

/** The organiser on their phone approves the device that shows the code. */
export async function approveQrLoginAction(token: string): Promise<{ ok: boolean }> {
  const me = await getAdmin();
  if (!me) return { ok: false };
  return { ok: await approveQrLogin(token, me.id) };
}

/** Every device logged in to this account is logged out, except this one, which gets a fresh cookie. */
export async function logoutOtherDevicesAction(): Promise<{ ok: boolean }> {
  const me = await requireAdmin();
  await db.update(adminUsers).set({ sessionsRevokedAt: new Date() }).where(eq(adminUsers.id, me.id));
  await setAdminCookie(me.id);
  await logAction(me, "account.logoutOthers", {});
  return { ok: true };
}
