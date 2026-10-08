import { and, eq, gt, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { registrations, sessions } from "@/db/schema";
import { notifyOrganizers } from "./alerts";
import { dispatchDraftEvents } from "@/modules/botc/lib/draft/events";
import { postDiscordMessage, spotsLeftEnabled, spotsLeftMessage } from "./discord";
import { recordDailyRun } from "./job-runs";
import { deleteOldLinkRequests } from "./link-throttle";
import { deleteOldLoginFailures } from "./login-limit";
import { deleteOldQrLogins } from "./qr-login";
import { sendDueReminders } from "@/modules/botc/lib/reminders";
import { anonymizeOldRegistrations, RETENTION_DAYS } from "./retention";
import { promoteWaitlist } from "@/modules/botc/lib/waitlist";

/**
 * Sessions starting this far ahead get the "spots left" Discord post. The cron runs once a day but Vercel
 * may start it anywhere within the hour, so the window is a little over a day wide – no session falls
 * between two runs; spotsPostedAt keeps it to one post.
 */
const SPOTS_WINDOW_HOURS: [number, number] = [34, 60];

/** Posts "N spots left" for sessions two days ahead that are not full yet; each session at most once. Off unless DISCORD_SPOTS_LEFT=1. */
export async function postSpotsLeft() {
  if (!spotsLeftEnabled()) return { posted: 0 };
  const now = Date.now();
  const from = new Date(now + SPOTS_WINDOW_HOURS[0] * 3600_000);
  const to = new Date(now + SPOTS_WINDOW_HOURS[1] * 3600_000);
  const due = await db
    .select({
      session: sessions,
      confirmed: sql<number>`(select count(*)::int from ${registrations} r where r.session_id = ${sessions}.id and r.status = 'confirmed')`,
    })
    .from(sessions)
    // closed sign-ups: no "spots left" post (left unclaimed, so it still goes out if they reopen in time)
    .where(
      and(
        gte(sessions.startsAt, from),
        lte(sessions.startsAt, to),
        isNull(sessions.spotsPostedAt),
        // sign-ups open, or opened on schedule (see modules/botc/lib/registration-state)
        or(eq(sessions.registrationState, "open"), lte(sessions.registrationOpensAt, new Date())),
      ),
    );
  let posted = 0;
  for (const { session, confirmed } of due) {
    const free = session.capacity - confirmed;
    // claim first so overlapping runs never post twice
    const [claimed] = await db
      .update(sessions)
      .set({ spotsPostedAt: new Date() })
      .where(and(eq(sessions.id, session.id), isNull(sessions.spotsPostedAt)))
      .returning({ id: sessions.id });
    if (!claimed || free <= 0) continue;
    if (await postDiscordMessage(spotsLeftMessage(session, free))) posted++;
    // a failed post may go out on the next run while the session is still in the window
    else await db.update(sessions).set({ spotsPostedAt: null }).where(eq(sessions.id, session.id));
  }
  return { posted };
}

/**
 * Safety net for upcoming sessions with a free spot and players still waiting – normally promotion runs
 * right after a cancellation, but that can fail (database hiccup, timeout) after the cancellation was saved.
 */
export async function promoteStuckWaitlists() {
  const stuck = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        gt(sessions.endsAt, new Date()),
        sql`exists (select 1 from ${registrations} r where r.session_id = ${sessions}.id and r.status = 'waitlisted')`,
        sql`(select count(*) from ${registrations} r where r.session_id = ${sessions}.id and r.status = 'confirmed') < ${sessions.capacity}`,
      ),
    );
  let promoted = 0;
  for (const { id } of stuck) promoted += (await promoteWaitlist(id)).length;
  return { promoted };
}

/** Everything the daily cron does; failures are reported to the organisers instead of thrown. */
export async function runDailyJobs() {
  const reminders = await sendDueReminders();
  if (reminders.failed > 0) {
    await notifyOrganizers(
      "Připomínky se nepodařilo odeslat",
      `${reminders.failed} z ${reminders.due} připomínek „zítra je hra“ selhalo. Zkontroluj nastavení e-mailu (Resend) a log ve Vercelu; připomínky se zkusí poslat znovu při dalším běhu.`,
    );
  }
  const spots = await postSpotsLeft().catch((e) => {
    console.error("Spots-left post failed", e);
    return { posted: 0 };
  });
  const retention = await anonymizeOldRegistrations().catch(async (e) => {
    console.error("Anonymisation failed", e);
    await notifyOrganizers(
      "Mazání starých osobních údajů selhalo",
      `Údaje hráčů z termínů starších než ${RETENTION_DAYS} dní se nepodařilo smazat: ${e instanceof Error ? e.message : String(e)}. Zkusí se to znovu při dalším běhu; podívej se do logu ve Vercelu.`,
    );
    return { anonymized: 0 };
  });
  const waitlists = await promoteStuckWaitlists().catch((e) => {
    console.error("Waitlist promotion failed", e);
    return { promoted: 0 };
  });
  // draft notifications that could not be sent right after the change
  const draftNotices = await dispatchDraftEvents().catch((e) => {
    console.error("Draft notifications failed", e);
    return { sent: 0, failed: 0 };
  });
  await deleteOldLoginFailures().catch((e) => console.error("Deleting old login failures failed", e));
  await deleteOldLinkRequests().catch((e) => console.error("Deleting old link requests failed", e));
  await deleteOldQrLogins().catch((e) => console.error("Deleting old QR logins failed", e));
  await recordDailyRun();
  return { reminders, spots, retention, waitlists, draftNotices };
}
