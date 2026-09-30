import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { loginFailures } from "@/db/schema";

/** Wrong admin passwords allowed from one network within the window before logins from it are refused. */
export const LOGIN_FAILURE_LIMIT = 10;
export const LOGIN_WINDOW_MINUTES = 15;

const windowStart = () => new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60_000);

export async function loginBlocked(ipHash: string) {
  const recent = await db
    .select({ id: loginFailures.id })
    .from(loginFailures)
    .where(and(eq(loginFailures.ipHash, ipHash), gt(loginFailures.createdAt, windowStart())))
    .limit(LOGIN_FAILURE_LIMIT);
  return recent.length >= LOGIN_FAILURE_LIMIT;
}

export async function recordLoginFailure(ipHash: string) {
  await db.insert(loginFailures).values({ ipHash });
}

/** After a successful login the network starts from zero again. */
export async function clearLoginFailures(ipHash: string) {
  await db.delete(loginFailures).where(eq(loginFailures.ipHash, ipHash));
}

/** Run by the daily cron: failures older than a day no longer count for anything. */
export async function deleteOldLoginFailures() {
  await db.delete(loginFailures).where(lt(loginFailures.createdAt, new Date(Date.now() - 864e5)));
}
