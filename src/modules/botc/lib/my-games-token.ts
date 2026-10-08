import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/token";

const TTL_DAYS = 7;

function sign(payload: string) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error("ADMIN_SECRET is not set.");
  return createHmac("sha256", secret).update(`my-games:${payload}`).digest("base64url");
}

/** Stateless signed token: "<base64url e-mail>.<expiry>.<signature>" */
export function createMyGamesToken(email: string) {
  const exp = Math.floor(Date.now() / 1000) + TTL_DAYS * 86400;
  const payload = `${Buffer.from(email.toLowerCase()).toString("base64url")}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/** The e-mail inside a valid, unexpired token, else null. */
export function verifyMyGamesToken(token: string): string | null {
  const [emailPart, exp, sig] = token.split(".");
  if (!emailPart || !exp || !sig || !process.env.ADMIN_SECRET) return null;
  const expected = sign(`${emailPart}.${exp}`);
  if (!safeEqual(sig, expected)) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  return Buffer.from(emailPart, "base64url").toString();
}
