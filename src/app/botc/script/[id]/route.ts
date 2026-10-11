import { eq } from "drizzle-orm";
import { db } from "@/db";
import { scripts } from "@/db/schema";
import { libraryScriptToolLink } from "@/modules/botc/lib/scripts";
import { parseId } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * A library script's short link (modules/botc/lib/scripts libraryScriptShortLink): to the script tool with the
 * script as the library has it now. Public like the links of a session's scripts, which it stands for.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  const [row] = id ? await db.select({ json: scripts.json }).from(scripts).where(eq(scripts.id, id)) : [];
  if (!row) return new Response("Script not found", { status: 404 });
  return new Response(null, { status: 302, headers: { location: libraryScriptToolLink(row), "cache-control": "no-store" } });
}
