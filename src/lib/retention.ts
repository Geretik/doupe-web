import { createHmac, randomBytes } from "node:crypto";
import { and, eq, inArray, lt, notLike } from "drizzle-orm";
import { db } from "@/db";
import { registrations, sessions } from "@/db/schema";

/** Players' personal data is deleted this long after the session ended; privacyNote and email.retentionNote in dictionaries.ts say it too. */
export const RETENTION_DAYS = 14;

export const ANON_SUFFIX = "@anonym.invalid";
const ERASED_PREFIX = "erased-";
/** Stand-in e-mail of a player an organiser added without one (the column is required and unique per session). */
export const NO_EMAIL_SUFFIX = "@bez-emailu.invalid";
/** Shown instead of the nickname of a player erased at their request. */
export const ERASED_NICKNAME = "(smazáno)";

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

/** Erased at the player's request: not tied to their other sign-ups any more, so stats skip it. */
export function isErased(email: string) {
  return email.startsWith(ERASED_PREFIX) && isAnonymized(email);
}

/** A unique stand-in e-mail for a player added without one; the daily cron anonymises it like any other. */
export function noEmailAddress() {
  return `walkin-${randomBytes(12).toString("hex")}${NO_EMAIL_SUFFIX}`;
}

/** A real address e-mails can go to: not deleted after the session, not a stand-in for a player without one. */
export function hasEmail(email: string) {
  return !isAnonymized(email) && !email.endsWith(NO_EMAIL_SUFFIX);
}

/** The e-mail to show organisers and players, or null once it has been deleted or there never was one. */
export function shownEmail(email: string) {
  return hasEmail(email) ? email : null;
}

/** Column values that delete a registration's personal data; nickname, note and cancel reason stay. */
export function anonymizedFields(email: string) {
  return { email: playerPseudonym(email), firstName: null, lastName: null, phone: null, ipHash: null };
}

/**
 * Values for erasing a registration at the player's request: everything personal goes, including the
 * nickname, note and cancel reason, and a random stand-in e-mail unlinks it from their other sign-ups.
 */
export function erasedFields() {
  return {
    email: `${ERASED_PREFIX}${randomBytes(12).toString("hex")}${ANON_SUFFIX}`,
    firstName: null,
    lastName: null,
    nickname: ERASED_NICKNAME,
    phone: null,
    note: null,
    cancelReason: null,
    ipHash: null,
  };
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
    await db.update(registrations).set(anonymizedFields(r.email)).where(eq(registrations.id, r.id));
  }
  return { anonymized: due.length };
}
