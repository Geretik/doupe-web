import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { buildIcs } from "@/lib/ics";
import { siteName } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) return new Response("Not found", { status: 404 });
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, numId) });
  if (!session) return new Response("Not found", { status: 404 });
  const body = buildIcs([session], `${siteName()} – ${session.title}`);
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="botc-${session.id}.ics"`,
      "cache-control": "no-store",
    },
  });
}
