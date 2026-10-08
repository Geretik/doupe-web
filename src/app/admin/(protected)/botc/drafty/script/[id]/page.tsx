import Link from "next/link";
import { notFound } from "next/navigation";
import { saveScriptAction, saveScriptToLibraryAction } from "@/modules/botc/actions/draft";
import { ActionButton } from "@/components/admin/action-button";
import { sideClass, sortByShownName, TeamRows } from "@/modules/botc/components/draft/role-chips";
import { DraftScriptForm } from "@/modules/botc/components/draft/script-form";
import { splitByGroup } from "@/modules/botc/components/draft/team-section";
import { Card } from "@/components/ui";
import { db } from "@/db";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { findRole, roleName } from "@/modules/botc/lib/botc-roles";
import { getScript } from "@/modules/botc/lib/draft/queries";
import { scriptToolLink } from "@/modules/botc/lib/draft/script";
import { loadSessionRows } from "@/modules/botc/lib/draft/service";
import { runtime, sessionAccess } from "@/modules/botc/lib/draft/state";
import { parseId } from "@/lib/validation";

const pill = "rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-accent";

/** A script made from a pool of a finished draft session: its author edits it, the session's members see it. */
export default async function DraftScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const id = parseId((await params).id);
  if (!id) notFound();
  const [{ locale, t }, script] = await Promise.all([getDict(), getScript(id)]);
  if (!script) notFound();
  const rows = await loadSessionRows(db, script.sessionId);
  if (!rows) notFound();
  if (!sessionAccess(me, rows.draft, rows.members).view) notFound();
  const d = t.draft;
  const pool = runtime(rows).pools.find((p) => p.id === script.poolId);
  if (!pool) notFound();
  const owner = pool.memberId === null ? d.sharedPoolTitle : rows.members.find((m) => m.id === pool.memberId)?.nickname ?? "?";
  const editable = script.createdBy === me.id;
  const groups = splitByGroup(sortByShownName(pool.roleIds, locale), (r) => [r]).map((g) => ({
    group: g.group,
    label: g.group === "bundles" ? d.bundles : t.admin.session.roleTeams[g.group],
    roles: g.items.map((roleId) => {
      const role = findRole(roleId);
      return { id: roleId, name: role ? roleName(role, locale) : roleId, className: sideClass(roleId) };
    }),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/admin/botc/drafty/${rows.draft.id}`} className="text-sm text-muted hover:underline">{d.backToDraft}</Link>
        <h1 className="text-2xl font-bold">{script.name}</h1>
        <p className="text-sm text-muted">
          {d.scriptTitle}: {rows.draft.name} · {d.scriptFrom(owner)}
        </p>
        <span className="flex flex-wrap items-center gap-2">
          <a href={scriptToolLink(script)} target="_blank" rel="noopener noreferrer" className={pill}>{d.openInTool}</a>
          <a href={`/admin/botc/drafty/script/${script.id}/script.json`} className={pill}>{d.downloadJson}</a>
          {script.libraryScriptId && <Link href={`/admin/botc/scripty/${script.libraryScriptId}`} className={pill}>{d.inLibrary}</Link>}
          {editable && (
            <ActionButton
              action={saveScriptToLibraryAction.bind(null, script.id)}
              label={script.libraryScriptId ? d.updateInLibrary : d.saveToLibrary}
            />
          )}
        </span>
        {editable && <p className="text-sm text-muted">{d.libraryHint}</p>}
      </div>
      {editable ? (
        <Card>
          <DraftScriptForm
            action={saveScriptAction.bind(null, script.id)}
            initial={{ name: script.name, author: script.author ?? "", roleIds: script.roleIds, version: script.version }}
            groups={groups}
            t={d.scriptForm}
          />
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-muted">{d.scriptReadOnly}</p>
          <TeamRows roleIds={script.roleIds} locale={locale} labels={t.admin.session.roleTeams} />
        </Card>
      )}
    </div>
  );
}
