import { createHmac } from "node:crypto";
import { and, eq, gt, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { linkRequests, type LinkKind } from "@/db/schema";
import { clientIpHash } from "./client-ip";

/** Link e-mails one network may ask for per hour, and the minimum gap between two links of a kind to one address. */
const PER_NETWORK_PER_HOUR = 10;
const PER_ADDRESS_GAP_MINUTES = 10;

function emailHash(email: string) {
  return createHmac("sha256", process.env.ADMIN_SECRET ?? "")
    .update(`link:${email.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
}

async function count(where: SQL | undefined) {
  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(linkRequests).where(where);
  return c;
}

/**
 * Throttles a "send me a link" form before anything is looked up or sent:
 * - "network": this network asked too often – the form says so;
 * - "address": this address got the same kind of link a moment ago – the form answers as if it was
 *   sent, so nobody learns whether the address is known and nobody can flood someone's inbox;
 * - null: the link may go out.
 * The request is recorded first and counted with the others, so parallel requests cannot all pass.
 */
export async function throttleLinkRequest(kind: LinkKind, email: string): Promise<"network" | "address" | null> {
  const ipHash = await clientIpHash();
  const hash = emailHash(email);
  const [own] = await db.insert(linkRequests).values({ kind, emailHash: hash, ipHash }).returning({ id: linkRequests.id });
  const hourAgo = new Date(Date.now() - 3600_000);
  const gapStart = new Date(Date.now() - PER_ADDRESS_GAP_MINUTES * 60_000);
  let verdict: "network" | "address" | null = null;
  if (ipHash && (await count(and(eq(linkRequests.ipHash, ipHash), gt(linkRequests.createdAt, hourAgo)))) > PER_NETWORK_PER_HOUR) {
    verdict = "network";
  } else if ((await count(and(eq(linkRequests.kind, kind), eq(linkRequests.emailHash, hash), gt(linkRequests.createdAt, gapStart)))) > 1) {
    verdict = "address";
  }
  // a refused request does not count, so repeating it cannot keep anyone locked out for longer
  if (verdict) await db.delete(linkRequests).where(eq(linkRequests.id, own.id));
  return verdict;
}

/** Run by the daily cron: requests older than a day no longer count for anything. */
export async function deleteOldLinkRequests() {
  await db.delete(linkRequests).where(lt(linkRequests.createdAt, new Date(Date.now() - 864e5)));
}
