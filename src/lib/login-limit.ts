import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginFailures } from "@/db/schema";
import { clientIpHash } from "./client-ip";

/** Wrong admin passwords allowed from one network within the window before logins from it are refused. */
export const LOGIN_FAILURE_LIMIT = 10;
export const LOGIN_WINDOW_MINUTES = 15;

export type LoginAttempt = {
  /** The network is over the limit: refuse without checking the password (this attempt is not counted). */
  blocked: boolean;
  /** The password was right: this attempt does not count. Earlier wrong ones still do until they expire. */
  succeeded: () => Promise<void>;
};

const noop = async () => {};

/**
 * Counts an admin password attempt (login, setup, password change) before the password is checked,
 * so a burst of parallel requests cannot all slip under the limit. Without a client IP (local
 * development) nothing is limited.
 */
export async function startLoginAttempt(): Promise<LoginAttempt> {
  const ipHash = await clientIpHash();
  if (!ipHash) return { blocked: false, succeeded: noop };
  const [own] = await db.insert(loginFailures).values({ ipHash }).returning({ id: loginFailures.id });
  const forget = async () => {
    await db.delete(loginFailures).where(eq(loginFailures.id, own.id));
  };
  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(loginFailures)
    .where(and(eq(loginFailures.ipHash, ipHash), gt(loginFailures.createdAt, new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60_000))));
  if (c > LOGIN_FAILURE_LIMIT) {
    await forget();
    return { blocked: true, succeeded: noop };
  }
  return { blocked: false, succeeded: forget };
}

/** Run by the daily cron: failures older than a day no longer count for anything. */
export async function deleteOldLoginFailures() {
  await db.delete(loginFailures).where(lt(loginFailures.createdAt, new Date(Date.now() - 864e5)));
}
