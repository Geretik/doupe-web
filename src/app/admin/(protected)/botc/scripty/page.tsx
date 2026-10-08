import Link from "next/link";
import { createLibraryScriptAction } from "@/modules/botc/actions/scripts";
import { LibraryScriptForm } from "@/modules/botc/components/admin/library-script-form";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listScripts, scriptExtras } from "@/modules/botc/lib/scripts";
import { formatDay } from "@/lib/time";

export const dynamic = "force-dynamic";

/** The club's library of scripts (modules/botc/lib/scripts): every account sees them all and may add one. */
export default async function ScriptsPage() {
  await requireAdmin();
  const [{ locale, t }, rows] = await Promise.all([getDict(), listScripts()]);
  const s = t.scripts;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{s.title}</h1>
        <p className="max-w-3xl text-sm text-muted">{s.intro}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">{s.none}</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2" data-testid="library-scripts">
          {rows.map(({ script, creator }) => (
            <li key={script.id}>
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
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{s.addTitle}</h2>
        <Card>
          <LibraryScriptForm action={createLibraryScriptAction} t={s.form} />
        </Card>
      </section>
    </div>
  );
}
