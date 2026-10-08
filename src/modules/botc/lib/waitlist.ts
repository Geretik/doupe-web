import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { registrations, sessions, type Registration, type Session } from "@/db/schema";
import { sendPromotedEmail } from "@/modules/botc/lib/registration-email";

/**
 * Moves waitlisted players into free spots of a session (oldest first) and e-mails them.
 * Safe to call after any cancellation or capacity change; does nothing when there is no room.
 * Returns the promoted registrations.
 */
export async function promoteWaitlist(sessionId: number): Promise<Registration[]> {
  const result = await db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .for("update");
    if (!session || session.endsAt < new Date()) return null;

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(registrations)
      .where(
        and(eq(registrations.sessionId, sessionId), eq(registrations.status, "confirmed")),
      );
    const free = session.capacity - count;
    if (free <= 0) return null;

    const next = await tx
      .select({ id: registrations.id })
      .from(registrations)
      .where(
        and(eq(registrations.sessionId, sessionId), eq(registrations.status, "waitlisted")),
      )
      .orderBy(asc(registrations.waitlistedAt), asc(registrations.id))
      .limit(free);
    if (next.length === 0) return null;

    const now = new Date();
    const promoted: Registration[] = [];
    for (const { id } of next) {
      // still waiting: the player may have cancelled since the select above (cancelling takes no session lock)
      const [row] = await tx
        .update(registrations)
        .set({
          status: "confirmed",
          waitlistedAt: null,
          confirmationSentAt: now, // claim the send – exactly one promotion e-mail
          lastEmailAt: now,
          updatedAt: now,
        })
        .where(and(eq(registrations.id, id), eq(registrations.status, "waitlisted")))
        .returning();
      if (row) promoted.push(row);
    }
    return { session, promoted };
  });

  if (!result) return [];
  await Promise.all(result.promoted.map((reg) => notify(reg, result.session)));
  return result.promoted;
}

async function notify(reg: Registration, session: Session) {
  try {
    await sendPromotedEmail(reg, session);
  } catch (e) {
    console.error("Promotion e-mail could not be sent", e);
    await db
      .update(registrations)
      .set({ confirmationSentAt: null })
      .where(eq(registrations.id, reg.id));
  }
}
