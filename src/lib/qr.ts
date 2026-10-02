import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { sessionUrl } from "./ics";
import { parseId } from "./validation";

/** The session's public sign-up URL, or null for an unknown id (route handlers answer 404). */
export async function qrTarget(id: string) {
  const numId = parseId(id);
  if (!numId) return null;
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, numId), columns: { id: true } });
  return session ? sessionUrl(session.id) : null;
}

/** QR code for posters and slides: black on white, a quiet zone of two modules. */
export function qrSvg(url: string) {
  return QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
}

export function qrPng(url: string) {
  return QRCode.toBuffer(url, { type: "png", margin: 2, width: 1024, errorCorrectionLevel: "M" });
}
