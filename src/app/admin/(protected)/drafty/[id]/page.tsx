import Link from "next/link";
import { notFound } from "next/navigation";
import { createSessionAction, deleteDraftAction, updateDraftAction } from "@/app/actions/draft";
import { ActionButton } from "@/components/admin/action-button";
import { DraftForm } from "@/components/draft/draft-form";
import { OptionChips } from "@/components/draft/role-chips";
import { SessionSettingsForm } from "@/components/draft/session-settings-form";
import { draftFormInitial, draftFormProps, modeInfos, modeSummary, StatusBadge } from "@/components/draft/view";
import { Card } from "@/components/ui";
import { plural } from "@/i18n/plural";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { draftModes, normalizeModeConfig } from "@/lib/draft/modes";
import { getDraft, listSessionsOfDraft } from "@/lib/draft/queries";
import { buildOptions, resolveRoleSource, totalRoles } from "@/lib/draft/roles";
import { isDraftManager } from "@/lib/draft/state";
import { parseId } from "@/lib/validation";

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const id = parseId((await params).id);
  if (!id) notFound();
  const [{ locale, t }, row] = await Promise.all([getDict(), getDraft(id)]);
  if (!row) notFound();
  const { draft, owner } = row;
  const manager = isDraftManager(me, draft);
  const sessions = await listSessionsOfDraft(draft.id, manager ? undefined : me.id);
  // somebody who neither manages the Draft nor plays in it has nothing to see here
  if (!manager && sessions.length === 0) notFound();
  const d = t.draft;
  const offer = buildOptions(resolveRoleSource(draft.roleSource), draft.bundles);
  const bundles = offer.options.filter((o) => o.roleIds.length > 1);
  const allowedModes = modeInfos(t, draft.modes);
  const firstMode = draft.modes[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/drafty" className="text-sm text-muted hover:underline">{d.back}</Link>
        <h1 className="text-2xl font-bold">{draft.name}</h1>
        {draft.note && <p className="whitespace-pre-line">{draft.note}</p>}
        <p className="text-sm text-muted">
          {owner && <>{d.owner(owner)} · </>}
          {plural(d.offered, totalRoles(offer.options))} {draft.modes.map((m) => d.modes[m].name).join(", ")}
        </p>
        {bundles.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{d.bundles}:</span>
            {bundles.map((b) => (
              <OptionChips key={b.roleIds.join("+")} roleIds={b.roleIds} locale={locale} />
            ))}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{d.sessionsTitle}</h2>
        {!manager && <p className="text-sm text-muted">{d.sessionsOnlyYours}</p>}
        {sessions.length === 0 ? (
          <p className="text-muted">{d.sessionsNone}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm" data-testid="draft-sessions">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="p-3">{d.columns.number}</th>
                  <th className="p-3">{d.columns.name}</th>
                  <th className="p-3">{d.columns.mode}</th>
                  <th className="p-3">{d.columns.status}</th>
                  <th className="p-3">{d.columns.players}</th>
                  <th className="p-3">{d.columns.progress}</th>
                  <th className="p-3">{d.columns.turn}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.session.id} className="border-b border-border last:border-0">
                    <td className="p-3 text-muted">#{s.session.id}</td>
                    <td className="p-3">
                      <Link href={`/admin/drafty/session/${s.session.id}`} className="font-medium underline hover:text-accent">
                        {s.session.name}
                      </Link>
                    </td>
                    <td className="p-3">{modeSummary(t, s.session)}</td>
                    <td className="p-3"><StatusBadge t={t} status={s.session.status} /></td>
                    <td className="p-3">{s.drafters}</td>
                    <td className="p-3 whitespace-nowrap">{s.target > 0 ? `${s.drafted} / ${s.target}` : "–"}</td>
                    <td className="p-3">{s.session.status === "active" ? s.current : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {manager && allowedModes.length > 0 && firstMode && (
          <Card>
            <h3 className="mb-1 font-semibold">{d.newSession}</h3>
            <p className="mb-3 text-xs text-muted">{d.newSessionHint}</p>
            <SessionSettingsForm
              action={createSessionAction.bind(null, draft.id)}
              modes={allowedModes}
              initial={{
                name: d.sessionNameDefault(sessions.length + 1),
                mode: firstMode,
                config: Object.fromEntries(
                  draft.modes.map((m) => [m, normalizeModeConfig(draftModes[m], draft.modeDefaults[m])]),
                ),
              }}
              t={{ name: d.sessionName, mode: d.mode, submit: d.createSession, saving: d.form.saving }}
            />
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{d.draftSettings}</h2>
        {manager ? (
          <>
            <p className="text-sm text-muted">{d.draftEditNote}</p>
            <Card>
              <DraftForm
                action={updateDraftAction.bind(null, draft.id)}
                initial={draftFormInitial(draft)}
                {...draftFormProps(t, locale, d.form.save)}
              />
            </Card>
            <div>
              <ActionButton action={deleteDraftAction.bind(null, draft.id)} label={d.deleteDraft} confirmText={d.deleteDraftConfirm} variant="danger" />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">{d.draftReadOnly(owner ?? "?")}</p>
        )}
      </section>
    </div>
  );
}
