import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns } from "@/db/schema";

const DAILY = "daily";

/**
 * The admin warns when the daily jobs have not finished for this long. Vercel Cron runs once a day
 * somewhere within the scheduled hour, so a healthy gap is at most about 25 hours.
 */
export const DAILY_STALE_HOURS = 26;

export async function recordDailyRun() {
  const finishedAt = new Date();
  await db
    .insert(jobRuns)
    .values({ name: DAILY, finishedAt })
    .onConflictDoUpdate({ target: jobRuns.name, set: { finishedAt } });
}

export async function lastDailyRun() {
  const row = await db.query.jobRuns.findFirst({ where: eq(jobRuns.name, DAILY) });
  return row?.finishedAt ?? null;
}

export type DailyJobsHealth =
  | { ok: true }
  | { ok: false; reason: "no_secret" }
  | { ok: false; reason: "never" }
  | { ok: false; reason: "stale"; last: Date };

/** Without CRON_SECRET Vercel's call is refused (see api/cron/reminders), so nothing runs at all. */
export async function dailyJobsHealth(): Promise<DailyJobsHealth> {
  if (!process.env.CRON_SECRET) return { ok: false, reason: "no_secret" };
  const last = await lastDailyRun();
  if (!last) return { ok: false, reason: "never" };
  if (Date.now() - last.getTime() > DAILY_STALE_HOURS * 3600_000) return { ok: false, reason: "stale", last };
  return { ok: true };
}
