import { createHmac } from "node:crypto";
import { and, eq, inArray, lt, notLike } from "drizzle-orm";
import { db } from "@/db";
import { registrations, sessions } from "@/db/schema";

/** Players' personal data is deleted this long after the session ended; privacyNote and email.retentionNote in dictionaries.ts say it too. */
export const RETENTION_DAYS = 14;

const ANON_SUFFIX = "@anonym.invalid";

/**
 * Stable stand-in for a player's e-mail once it is deleted: the same player always gets the same one,
 * so stats ("regulars", unique players) keep working, but the e-mail cannot be read back from it.
 */
export function playerPseudonym(email: string) {
  if (isAnonymized(email)) return email;
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error("ADMIN_SECRET is not set.");
  const hash = createHmac("sha256", secret).update(`player:${email.trim().toLowerCase()}`).digest("hex");
  return `${hash.slice(0, 24)}${ANON_SUFFIX}`;
}

export function isAnonymized(email: string) {
  return email.endsWith(ANON_SUFFIX);
}

/** The e-mail to show organisers, or null once it has been deleted. */
export function shownEmail(email: string) {
  return isAnonymized(email) ? null : email;
}

/**
 * Deletes names, e-mails and phones of registrations for sessions that ended more than RETENTION_DAYS ago.
 * Nickname, status, attendance, the player's note and cancel reason stay (organisers asked to keep those).
 */
export async function anonymizeOldRegistrations() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 864e5);
  const due = await db
    .select({ id: registrations.id, email: registrations.email })
    .from(registrations)
    .where(
      and(
        inArray(
          registrations.sessionId,
          db.select({ id: sessions.id }).from(sessions).where(lt(sessions.endsAt, cutoff)),
        ),
        notLike(registrations.email, `%${ANON_SUFFIX}`),
      ),
    );
  for (const r of due) {
    await db
      .update(registrations)
      .set({
        email: playerPseudonym(r.email),
        firstName: null,
        lastName: null,
        phone: null,
        ipHash: null,
      })
      .where(eq(registrations.id, r.id));
  }
  return { anonymized: due.length };
}
