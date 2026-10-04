import { and, eq, gt, isNull, lte, notLike, sql } from "drizzle-orm";
import { db } from "@/db";
import { registrations, sessions } from "@/db/schema";
import { sendReminderEmail } from "./email";
import { NO_EMAIL_SUFFIX } from "./retention";

/** Reminders go out to players of sessions starting within this many hours. */
export const REMINDER_WINDOW_HOURS = 36;

/**
 * Sends the "game night is coming up" e-mail to every confirmed player who has not
 * received it yet, for sessions starting within the window (or for one given session).
 * Each registration gets the reminder at most once.
 */
export async function sendDueReminders(opts: { sessionId?: number; ignoreWindow?: boolean } = {}) {
  const now = new Date();
  const until = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 3600_000);

  const conditions = [
    eq(registrations.status, "confirmed"),
    isNull(registrations.reminderSentAt),
    notLike(registrations.email, `%${NO_EMAIL_SUFFIX}`),
    gt(sessions.startsAt, now),
  ];
  if (!opts.ignoreWindow) conditions.push(lte(sessions.startsAt, until));
  if (opts.sessionId !== undefined) conditions.push(eq(sessions.id, opts.sessionId));

  const due = await db
    .select({ registration: registrations, session: sessions })
    .from(registrations)
    .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
    .where(and(...conditions));

  let sent = 0;
  let failed = 0;
  for (const { registration, session } of due) {
    // claim first so two overlapping cron runs never send twice; the fresh row skips a player who
    // cancelled while the run was going and has their latest arrival and departure
    const [claimed] = await db
      .update(registrations)
      .set({ reminderSentAt: now, lastEmailAt: now })
      .where(and(eq(registrations.id, registration.id), eq(registrations.status, "confirmed"), isNull(registrations.reminderSentAt)))
      .returning();
    if (!claimed) continue;
    try {
      await sendReminderEmail(claimed, session);
      sent++;
    } catch (e) {
      console.error("Reminder could not be sent", e);
      failed++;
      await db
        .update(registrations)
        .set({ reminderSentAt: null })
        .where(eq(registrations.id, registration.id));
    }
  }
  return { due: due.length, sent, failed };
}

/** Confirmed players of a session who still have a reminder pending. */
export async function countPendingReminders(sessionId: number) {
  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(registrations)
    .where(
      and(
        eq(registrations.sessionId, sessionId),
        eq(registrations.status, "confirmed"),
        isNull(registrations.reminderSentAt),
        notLike(registrations.email, `%${NO_EMAIL_SUFFIX}`),
      ),
    );
  return c;
}
