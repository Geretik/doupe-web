import { db } from "@/db";
import { getAdmin } from "@/lib/admin-auth";
import { getScript } from "@/modules/botc/lib/draft/queries";
import { scriptFileName, scriptJson } from "@/modules/botc/lib/draft/script";
import { loadSessionRows } from "@/modules/botc/lib/draft/service";
import { sessionAccess } from "@/modules/botc/lib/draft/state";
import { parseId } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** A draft's script as a JSON file for the official script tool, clocktower.online or the club's script tool. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getAdmin();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const id = parseId((await params).id);
  const script = id ? await getScript(id) : null;
  const rows = script ? await loadSessionRows(db, script.sessionId) : null;
  if (!script || !rows || !sessionAccess(me, rows.draft, rows.members).view) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(scriptJson(script), null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(scriptFileName(script.name))}`,
    },
  });
}
