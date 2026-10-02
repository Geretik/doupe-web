import { randomBytes, timingSafeEqual } from "node:crypto";

export function generateEditToken() {
  return randomBytes(32).toString("base64url");
}

/** Constant-time comparison of two secrets; strings of different byte length are simply unequal. */
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
