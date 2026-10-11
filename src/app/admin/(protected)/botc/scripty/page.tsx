import Link from "next/link";
import { createLibraryScriptAction } from "@/modules/botc/actions/scripts";
import { LibraryScriptForm } from "@/modules/botc/components/admin/library-script-form";
import { Alert, Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { scriptToolUrl } from "@/lib/site";
import { listScripts, scriptExtras } from "@/modules/botc/lib/scripts";
import { formatDay } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * The club's library of scripts (modules/botc/lib/scripts): every account sees them all and may add one.
 * `?do-toolu`: opened from the script tool's "Načíst z Doupěte" (scripts/script-tool-html.mjs) – a script picked
 * opens back in the tool, through its short link.
 */
export default async function ScriptsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const [{ locale, t }, rows, query] = await Promise.all([getDict(), listScripts(), searchParams]);
  const s = t.scripts;
  const forTool = "do-toolu" in query;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{s.title}</h1>
        {forTool ? (
          <Alert kind="info">
            {s.pickForTool}{" "}
            <a href={scriptToolUrl()} className="font-medium underline">
              {s.pickBack}
            </a>
          </Alert>
        ) : (
          <>
            <p className="max-w-3xl text-sm text-muted">{s.intro}</p>
            <span className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium">
              <Link href="/admin/botc/scripty/novy" className="text-accent hover:underline">{s.builderLink} →</Link>
              <Link href="/admin/botc/scripty/homebrew" className="text-accent hover:underline">{s.homebrewLink} →</Link>
            </span>
          </>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">{s.none}</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2" data-testid="library-scripts">
          {rows.map(({ script, creator }) => (
            <li key={script.id}>
              {/* from the script tool: the short link opens the script there, in the same tab */}
              {forTool ? (
                <a href={`/botc/script/${script.id}`} className="block h-full" data-testid="pick-for-tool">
                <Card className="flex h-full flex-col gap-1 hover:border-accent/50">
                  <p className="font-semibold">{script.name}</p>
                  <p className="text-sm text-muted">
                    {[script.author, s.characters(script.roleIds.length + scriptExtras(script).length), s.addedBy(creator, formatDay(script.createdAt, locale))]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </Card>
              </a>
              ) : (
                <Link href={`/admin/botc/scripty/${script.id}`} className="block h-full">
                <Card className="flex h-full flex-col gap-1 hover:border-accent/50">
                  <p className="font-semibold">{script.name}</p>
                  <p className="text-sm text-muted">
                    {[script.author, s.characters(script.roleIds.length + scriptExtras(script).length), s.addedBy(creator, formatDay(script.createdAt, locale))]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </Card>
              </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {!forTool && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{s.addTitle}</h2>
          <Card>
            <LibraryScriptForm action={createLibraryScriptAction} t={s.form} />
          </Card>
        </section>
      )}
    </div>
  );
}
