import { and, asc, eq, isNull, lt, lte, sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { adminUsers, draftEvents, draftSessionMembers, draftSessions, drafts, type DraftEvent, type DraftMemberRole, type DraftSession } from "@/db/schema";
import { dictionaries, type Locale } from "@/i18n/dictionaries";
import { sendLinkEmail } from "../email";
import { draftUrl } from "../site";

/*
 * Notifications of the drafts. The service writes an event (draft_events) in the same transaction as the change
 * it is about – a turn, an invitation – so none is lost and none is sent for a change that was rolled back.
 * Invitations, the end and a cancellation are due at once. A turn is due only TURN_REMINDER_HOURS later and goes
 * out only if the drafter is still on that turn then: whoever picks within a day gets no e-mail at all.
 * In-app there is nothing to send: the admin menu and "My sessions" read the turn from the session itself.
 *
 * Who sends them: every draft action and every admin page (dispatchDraftEventsLater), and the daily cron as the
 * safety net – Vercel's free plan runs a cron once a day, so with nobody on the admin a reminder can wait for it.
 */

/** A drafter on turn gets an e-mail only once they have not picked for this long */
export const TURN_REMINDER_HOURS = 24;

/** Attempts per event before it is given up */
const MAX_ATTEMPTS = 5;

export type DraftRecipient = { memberId: number; nickname: string; email: string; locale: Locale; role: DraftMemberRole };

export type DraftNotice = {
  event: DraftEvent;
  session: DraftSession;
  draftName: string;
  /** Who sent the invitation (for "invited") */
  inviter: string | null;
  recipients: DraftRecipient[];
};

/** One way of telling people about an event; e-mail now, more (Discord, push) can be added to the list. */
export interface DraftNotifier {
  name: string;
  /** Throws when it could not reach anybody, so the event is tried again later. */
  notify(notice: DraftNotice): Promise<void>;
}

const emailNotifier: DraftNotifier = {
  name: "email",
  async notify({ event, session, draftName, inviter, recipients }) {
    let failed = 0;
    for (const r of recipients) {
      const t = dictionaries[r.locale];
      const e = t.draft.email;
      const url = draftUrl(session.draftId);
      const message =
        event.type === "invited"
          ? { subject: e.inviteSubject(draftName), body: e.inviteBody(inviter ?? "?", draftName, t.draft.memberRoles[r.role]) }
          : event.type === "turn"
            ? { subject: e.turnSubject(draftName), body: e.turnBody(draftName, event.pickNumber ?? session.pickNumber, TURN_REMINDER_HOURS) }
            : event.type === "completed"
              ? { subject: e.completedSubject(draftName), body: e.completedBody(draftName) }
              : { subject: e.cancelledSubject(draftName), body: e.cancelledBody(draftName) };
      try {
        await sendLinkEmail(r.email, message.subject, t.email.hi(r.nickname), message.body, url);
      } catch (err) {
        console.error(`Draft e-mail (${event.type}) to member ${r.memberId} failed`, err);
        failed++;
      }
    }
    // tried again later only when nobody got it – a retry would send the others a second copy
    if (failed > 0 && failed === recipients.length) throw new Error("Draft e-mail could not be sent.");
  },
};

export const draftNotifiers: DraftNotifier[] = [emailNotifier];

/** Who an event is for, as things are now: a turn that has moved on or an invitation already answered is dropped. */
async function buildNotice(event: DraftEvent): Promise<DraftNotice | null> {
  const [row] = await db
    .select({ session: draftSessions, draftName: drafts.name })
    .from(draftSessions)
    .innerJoin(drafts, eq(drafts.id, draftSessions.draftId))
    .where(eq(draftSessions.id, event.sessionId));
  if (!row) return null;
  const { session } = row;
  const members = await db
    .select({ member: draftSessionMembers, email: adminUsers.email, nickname: adminUsers.nickname })
    .from(draftSessionMembers)
    .innerJoin(adminUsers, eq(adminUsers.id, draftSessionMembers.userId))
    .where(eq(draftSessionMembers.sessionId, session.id));
  const toRecipient = (m: (typeof members)[number]): DraftRecipient => ({
    memberId: m.member.id,
    nickname: m.nickname,
    email: m.email,
    locale: m.member.locale,
    role: m.member.role,
  });
  let chosen: typeof members = [];
  let inviter: string | null = null;
  switch (event.type) {
    case "invited": {
      const m = members.find((x) => x.member.id === event.memberId);
      if (session.status === "preparing" && m?.member.status === "invited") chosen = [m];
      if (m?.member.invitedBy) {
        const [u] = await db.select({ nickname: adminUsers.nickname }).from(adminUsers).where(eq(adminUsers.id, m.member.invitedBy));
        inviter = u?.nickname ?? null;
      }
      break;
    }
    case "turn":
      if (session.status === "active" && session.currentMemberId === event.memberId && session.pickNumber === event.pickNumber) {
        chosen = members.filter((x) => x.member.id === event.memberId);
      }
      break;
    case "completed":
      chosen = members.filter((x) => x.member.status === "accepted");
      break;
    case "cancelled":
      chosen = members.filter((x) => x.member.status !== "declined");
      break;
  }
  return { event, session, draftName: row.draftName, inviter, recipients: chosen.map(toRecipient) };
}

/**
 * Sends the events that are due. Each one is claimed first, so two runs at once (after a pick and the cron)
 * never send it twice; a failed one is released for a later run, up to MAX_ATTEMPTS times.
 */
export async function dispatchDraftEvents(limit = 100) {
  const pending = await db
    .select()
    .from(draftEvents)
    .where(and(isNull(draftEvents.dispatchedAt), lte(draftEvents.dueAt, new Date()), lt(draftEvents.attempts, MAX_ATTEMPTS)))
    .orderBy(asc(draftEvents.id))
    .limit(limit);
  let sent = 0;
  let failed = 0;
  for (const ev of pending) {
    const [claimed] = await db
      .update(draftEvents)
      .set({ dispatchedAt: new Date(), attempts: sql`${draftEvents.attempts} + 1` })
      .where(and(eq(draftEvents.id, ev.id), isNull(draftEvents.dispatchedAt)))
      .returning();
    if (!claimed) continue;
    try {
      const notice = await buildNotice(claimed);
      const recipients = notice?.recipients.length ?? 0;
      if (notice && recipients) {
        for (const notifier of draftNotifiers) await notifier.notify(notice);
      }
      await db.update(draftEvents).set({ recipients }).where(eq(draftEvents.id, claimed.id));
      sent++;
    } catch (e) {
      console.error("Draft notification failed", e);
      failed++;
      await db.update(draftEvents).set({ dispatchedAt: null }).where(eq(draftEvents.id, claimed.id));
    }
  }
  return { sent, failed };
}

/** Sends what is due after the response has gone out – after a draft action and on every admin page. */
export function dispatchDraftEventsLater() {
  after(async () => {
    try {
      await dispatchDraftEvents();
    } catch (e) {
      console.error("Draft notifications failed", e);
    }
  });
}
