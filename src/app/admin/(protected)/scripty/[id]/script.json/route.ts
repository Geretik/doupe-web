import { getAdmin } from "@/lib/admin-auth";
import { scriptFileName } from "@/modules/botc/lib/draft/script";
import { getLibraryScript } from "@/modules/botc/lib/scripts";
import { parseId } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** A script of the club's library as its JSON file, for the official script tool, clocktower.online and the like. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) return new Response("Unauthorized", { status: 401 });
  const id = parseId((await params).id);
  const row = id ? await getLibraryScript(id) : null;
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(row.script.json, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(scriptFileName(row.script.name))}`,
    },
  });
}
