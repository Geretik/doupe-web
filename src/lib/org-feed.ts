import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers, type AdminUser } from "@/db/schema";
import { siteUrl } from "./site";

const newKey = () => randomBytes(16).toString("hex");

/**
 * The organiser's own link to the calendar feed. Each account has its own key, made the first time the
 * link is shown: a deleted account's link stops working, and a leaked one can be replaced.
 */
export async function orgFeedUrl(user: AdminUser) {
  let key = user.feedKey;
  if (!key) {
    const [row] = await db
      .update(adminUsers)
      .set({ feedKey: newKey() })
      .where(and(eq(adminUsers.id, user.id), isNull(adminUsers.feedKey)))
      .returning({ feedKey: adminUsers.feedKey });
    // a parallel request may have made it first
    key = row?.feedKey ?? (await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, user.id), columns: { feedKey: true } }))?.feedKey ?? null;
  }
  return key ? `${siteUrl()}/admin/kalendar.ics?key=${key}` : null;
}

/** Replaces the organiser's feed key; calendars subscribed to the old link stop updating. */
export async function rotateFeedKey(userId: number) {
  await db.update(adminUsers).set({ feedKey: newKey() }).where(eq(adminUsers.id, userId));
}

/** Whether the key belongs to an existing account. */
export async function feedKeyValid(key: string) {
  if (!/^[0-9a-f]{32}$/.test(key)) return false;
  return Boolean(await db.query.adminUsers.findFirst({ where: eq(adminUsers.feedKey, key), columns: { id: true } }));
}
