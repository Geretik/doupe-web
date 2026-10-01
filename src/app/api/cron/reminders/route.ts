import { timingSafeEqual } from "node:crypto";
import { isAdmin } from "@/lib/admin-auth";
import { notifyOrganizers } from "@/lib/alerts";
import { runDailyJobs } from "@/lib/cron";

export const dynamic = "force-dynamic";

function bearerOk(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return (
    header.length === expected.length &&
    timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  );
}

/**
 * Daily jobs: "game night is tomorrow" reminders, the optional "spots left" Discord post and deleting old personal data.
 * Called by Vercel Cron (see vercel.json) with `Authorization: Bearer $CRON_SECRET`;
 * a logged-in admin can also open it in the browser.
 */
export async function GET(req: Request) {
  if (!bearerOk(req) && !(await isAdmin())) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    return Response.json(await runDailyJobs());
  } catch (e) {
    console.error("Cron failed", e);
    await notifyOrganizers("Denní cron selhal", `Chyba: ${e instanceof Error ? e.message : String(e)}. Podívej se do logu ve Vercelu.`);
    return new Response("Cron failed", { status: 500 });
  }
}
