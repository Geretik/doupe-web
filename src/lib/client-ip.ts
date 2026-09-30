import { createHash } from "node:crypto";
import { headers } from "next/headers";

/** Salted hash of the caller's IP – enough to rate-limit, not enough to identify anyone later. */
export async function clientIpHash() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0]?.trim();
  if (!ip) return null;
  return createHash("sha256").update(`${process.env.ADMIN_SECRET ?? ""}:${ip}`).digest("hex").slice(0, 32);
}
