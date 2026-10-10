import { getAdmin } from "@/lib/admin-auth";
import { scriptFileName } from "@/modules/botc/lib/draft/script";
import { getDict } from "@/i18n/server";
import { homebrewCollectionScript } from "@/modules/botc/lib/homebrew";

export const dynamic = "force-dynamic";

/** A homebrew collection as a script's JSON file with all its characters in full (in the page's language), to upload in the script tool. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!(await getAdmin())) return new Response("Unauthorized", { status: 401 });
  const { locale } = await getDict();
  const script = homebrewCollectionScript((await params).key, locale);
  if (!script) return new Response("Not found", { status: 404 });
  const name = (script[0] as { name: string }).name;
  return new Response(JSON.stringify(script, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(scriptFileName(name))}`,
    },
  });
}
