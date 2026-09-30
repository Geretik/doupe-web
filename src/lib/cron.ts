import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { registrations, sessions } from "@/db/schema";
import { notifyOrganizers } from "./alerts";
import { discordConfigured, postDiscordMessage, spotsLeftMessage } from "./discord";
import { sendDueReminders } from "./reminders";
import { anonymizeOldRegistrations, RETENTION_DAYS } from "./retention";

/** Sessions starting this far ahead get the "spots left" Discord post (the cron runs once a day). */
const SPOTS_WINDOW_HOURS: [number, number] = [36, 60];

/** Posts "N spots left" for sessions two days ahead that are not full yet; each session at most once. */
export async function postSpotsLeft() {
  if (!discordConfigured()) return { posted: 0 };
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
    .where(and(gte(sessions.startsAt, from), lte(sessions.startsAt, to), isNull(sessions.spotsPostedAt), eq(sessions.registrationState, "open")));
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
  }
  return { posted };
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
  return { reminders, spots, retention };
}
