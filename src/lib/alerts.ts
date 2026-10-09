import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers, sessionEmailPrefs } from "@/db/schema";
import { postToWebhook } from "./discord";
import { sendPlainEmail } from "./email";

/** A signed-up player cancelling less than this before the start is reported to the organisers. */
export const LATE_CANCEL_HOURS = 24;

/**
 * Tells the organisers that something needs attention: e-mail to every admin account
 * and a Discord message when DISCORD_ALERTS_WEBHOOK_URL is configured. Never throws – alerts must not
 * break the action that triggered them. About a session (`sessionId`), the e-mail only goes to the accounts that
 * want that session's e-mails (sessionEmailRecipients); problems of the site itself go to everyone.
 */
export async function notifyOrganizers(subject: string, text: string, about?: { sessionId: number }) {
  const results = await Promise.allSettled([
    (async () => {
      const users = about ? await sessionEmailRecipients(about.sessionId) : await db.select({ email: adminUsers.email }).from(adminUsers);
      await Promise.all(users.map((u) => sendPlainEmail(u.email, `[BotC admin] ${subject}`, text)));
    })(),
    // a separate, organisers-only channel: alerts carry nicknames and cancel reasons
    postToWebhook(process.env.DISCORD_ALERTS_WEBHOOK_URL, `⚠️ **${subject}**\n${text}`),
  ]);
  for (const r of results) {
    if (r.status === "rejected") console.error("Organizer alert failed", r.reason);
  }
}

/** Accounts that get the e-mails about this session: their choice at the session, else their default. */
export function sessionEmailRecipients(sessionId: number) {
  return db
    .select({ email: adminUsers.email })
    .from(adminUsers)
    .leftJoin(sessionEmailPrefs, and(eq(sessionEmailPrefs.userId, adminUsers.id), eq(sessionEmailPrefs.sessionId, sessionId)))
    .where(sql`coalesce(${sessionEmailPrefs.enabled}, ${adminUsers.sessionEmails})`);
}

/** Whether this account gets the e-mails about this session, and whether that is its own choice there. */
export async function sessionEmailsFor(user: { id: number; sessionEmails: boolean }, sessionId: number) {
  const pref = await db.query.sessionEmailPrefs.findFirst({
    where: and(eq(sessionEmailPrefs.userId, user.id), eq(sessionEmailPrefs.sessionId, sessionId)),
  });
  return { enabled: pref?.enabled ?? user.sessionEmails, chosen: pref !== undefined };
}

export async function setSessionEmails(userId: number, sessionId: number, enabled: boolean) {
  await db
    .insert(sessionEmailPrefs)
    .values({ userId, sessionId, enabled })
    .onConflictDoUpdate({ target: [sessionEmailPrefs.sessionId, sessionEmailPrefs.userId], set: { enabled } });
}
