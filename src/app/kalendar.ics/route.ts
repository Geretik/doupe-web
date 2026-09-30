import { gte } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { buildIcs } from "@/lib/ics";
import { siteName } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Public iCal feed: all sessions from the last 90 days onwards. */
export async function GET() {
  const since = new Date(Date.now() - 90 * 864e5);
  const list = await db.query.sessions.findMany({
    where: gte(sessions.endsAt, since),
    orderBy: (s, { asc }) => [asc(s.startsAt)],
  });
  return new Response(buildIcs(list, siteName()), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "public, max-age=900",
    },
  });
}
