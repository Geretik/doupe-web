import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteLibraryScriptAction, updateLibraryScriptAction } from "@/modules/botc/actions/scripts";
import { ActionButton } from "@/components/admin/action-button";
import { LibraryScriptForm } from "@/modules/botc/components/admin/library-script-form";
import { TeamRows } from "@/modules/botc/components/draft/role-chips";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { canEditScript, getLibraryScript, libraryScriptToolLink, MAX_LINK, scriptExtras } from "@/modules/botc/lib/scripts";
import { formatDay, formatStamp } from "@/lib/time";
import { parseId } from "@/lib/validation";

export const dynamic = "force-dynamic";

const pill = "rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-accent";

/** One script of the library: its characters, the script tool and the file; the one who added it edits it. */
export default async function LibraryScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const id = parseId((await params).id);
  if (!id) notFound();
  const [{ locale, t }, row] = await Promise.all([getDict(), getLibraryScript(id)]);
  if (!row) notFound();
  const { script, creator } = row;
  const s = t.scripts;
  const toolLink = libraryScriptToolLink(script);
  const extras = scriptExtras(script);
  const editable = canEditScript(me, script);
  const edited = script.updatedAt.getTime() - script.createdAt.getTime() > 60_000;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/scripty" className="text-sm text-muted hover:underline">{s.back}</Link>
        <h1 className="text-2xl font-bold">{script.name}</h1>
        <p className="text-sm text-muted">
          {[
            script.author,
            s.characters(script.roleIds.length + extras.length),
            s.addedBy(creator, formatDay(script.createdAt, locale)),
            edited && s.updated(formatStamp(script.updatedAt, locale)),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <span className="flex flex-wrap gap-2">
          <a href={toolLink} target="_blank" rel="noopener noreferrer" className={pill}>{s.openInTool}</a>
          <a href={`/admin/scripty/${script.id}/script.json`} className={pill}>{s.downloadJson}</a>
        </span>
        {toolLink.length > MAX_LINK && <p className="text-xs text-muted">{s.noLink}</p>}
      </div>

      <Card className="flex flex-col gap-3" id="characters">
        <TeamRows roleIds={script.roleIds} locale={locale} labels={t.admin.session.roleTeams} />
        {extras.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">{s.extrasTitle}</p>
            <p className="text-sm">{extras.join(", ")}</p>
          </div>
        )}
      </Card>

      {editable ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{s.editTitle}</h2>
          <Card>
            <LibraryScriptForm
              action={updateLibraryScriptAction.bind(null, script.id)}
              initial={{ name: script.name, author: script.author ?? "" }}
              t={s.form}
            />
          </Card>
          <span>
            <ActionButton action={deleteLibraryScriptAction.bind(null, script.id)} label={s.delete} confirmText={s.deleteConfirm(script.name)} variant="danger" />
          </span>
        </section>
      ) : (
        <p className="text-sm text-muted">{s.readOnly}</p>
      )}
    </div>
  );
}
