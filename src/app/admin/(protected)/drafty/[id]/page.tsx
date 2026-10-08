import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelDraftAction,
  createScriptAction,
  deleteDraftAction,
  deleteScriptAction,
  inviteMembersAction,
  moveMemberAction,
  pickAction,
  removeMemberAction,
  respondInviteAction,
  saveScriptToLibraryAction,
  shuffleOrderAction,
  startDraftAction,
  updateDraftAction,
  updateMemberAction,
} from "@/modules/botc/actions/draft";
import { ActionButton } from "@/components/admin/action-button";
import { AutoRefresh } from "@/modules/botc/components/draft/auto-refresh";
import { DraftForm } from "@/modules/botc/components/draft/draft-form";
import { DraftInviteForm } from "@/modules/botc/components/draft/invite-form";
import { PickBoard, type BoardGroup } from "@/modules/botc/components/draft/pick-board";
import { OptionChips, optionLabel, TeamRows } from "@/modules/botc/components/draft/role-chips";
import { splitByGroup, TeamSection, type GroupKey } from "@/modules/botc/components/draft/team-section";
import { TurnTitle } from "@/modules/botc/components/draft/turn-title";
import { draftFormInitial, draftFormProps, modeSummary, StatusBadge } from "@/modules/botc/components/draft/view";
import { Button, Card } from "@/components/ui";
import { db } from "@/db";
import type { DraftSessionMember } from "@/db/schema";
import type { Dict, Locale } from "@/i18n/dictionaries";
import { plural } from "@/i18n/plural";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { draftModes, fits } from "@/modules/botc/lib/draft/modes";
import { listInvitableAccounts, listScriptsOfSession, sessionIdOfDraft } from "@/modules/botc/lib/draft/queries";
import { sortRoleIds, totalRoles } from "@/modules/botc/lib/draft/roles";
import { scriptToolLink } from "@/modules/botc/lib/draft/script";
import { canScriptPool, loadSessionRows } from "@/modules/botc/lib/draft/service";
import { drafters, runtime, sessionAccess, startReview, type StartCheck } from "@/modules/botc/lib/draft/state";
import { formatStamp } from "@/lib/time";
import { parseId } from "@/lib/validation";

const pill = "rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-accent";

/** Options split into the bundles and the teams, by the names shown; for the offer and the pick board. */
function groupOptions<T extends { roleIds: string[] }>(options: T[], t: Dict, locale: Locale): { group: GroupKey; label: string; options: T[] }[] {
  const collator = new Intl.Collator(locale);
  const sorted = [...options].sort((a, b) => collator.compare(optionLabel(a.roleIds, locale), optionLabel(b.roleIds, locale)));
  return splitByGroup(sorted, (o) => o.roleIds).map((g) => ({
    group: g.group,
    label: g.group === "bundles" ? t.draft.bundles : t.admin.session.roleTeams[g.group],
    options: g.items,
  }));
}

function CheckLine({ check, t, locale }: { check: StartCheck; t: Dict; locale: Locale }) {
  const c = t.draft.check;
  if (check.kind === "bundles") {
    return (
      <>
        {check.incomplete.map((b) => (
          <li key={b.roleIds.join("+")} className="flex gap-2">
            <span aria-hidden>⚠️</span>
            {c.bundle(optionLabel(b.roleIds, locale), optionLabel(b.missing, locale))}
          </li>
        ))}
      </>
    );
  }
  const text =
    check.kind === "drafters"
      ? c.drafters(check.count, check.min)
      : check.kind === "accepted"
        ? check.ok
          ? c.acceptedOk
          : c.acceptedPending(check.pending.join(", "))
        : c.roles(check.offered, check.problem?.kind === "notEnoughRoles" ? check.problem.needed : null);
  return (
    <li className={`flex gap-2 ${check.ok ? "" : "text-accent"}`}>
      <span aria-hidden>{check.ok ? "✅" : "❌"}</span>
      {text}
    </li>
  );
}

/**
 * One draft: its members and settings while it is prepared, the turn and the pick board while it runs, the
 * pools, scripts and history. The URL has the draft's id; the changes go to its run (the session row).
 */
export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const draftId = parseId((await params).id);
  if (!draftId) notFound();
  const sessionId = await sessionIdOfDraft(draftId);
  if (!sessionId) notFound();
  const [{ locale, t }, rows] = await Promise.all([getDict(), loadSessionRows(db, sessionId)]);
  if (!rows) notFound();
  const access = sessionAccess(me, rows.draft, rows.members);
  // members only (and the draft's owner and administrators)
  if (!access.view) notFound();
  const { session, draft, members } = rows;
  const id = session.id;
  const d = t.draft;
  const status = session.status;
  const mode = draftModes[session.mode];
  const rt = runtime(rows);
  const mine = access.member;
  const onTurn = status === "active" && mine !== null && session.currentMemberId === mine.id;
  const review = status === "preparing" ? startReview(rows) : null;
  const [scripts, invitable] = await Promise.all([
    status === "completed" ? listScriptsOfSession(id) : Promise.resolve([]),
    status === "preparing" && access.manage ? listInvitableAccounts(id) : Promise.resolve([]),
  ]);
  const myPool = mine && access.drafter ? mode.poolOf(mine.id, rt.pools) : undefined;
  const sharedPool = session.mode === "shared" ? rt.pools[0] : undefined;
  const nicknameOf = new Map(members.map((m) => [m.id, m.nickname]));
  const poolTitle = (memberId: number | null) => (memberId === null ? d.sharedPoolTitle : nicknameOf.get(memberId) ?? "?");
  const poolToolLink = (p: { memberId: number | null; roleIds: string[] }) => {
    const owner = p.memberId === null ? undefined : nicknameOf.get(p.memberId);
    return scriptToolLink({ name: [draft.name, owner].filter(Boolean).join(" – "), author: owner ?? null, roleIds: sortRoleIds(p.roleIds) });
  };

  const order = status === "preparing" ? drafters(members) : rt.order;
  const others = members.filter((m) => !order.includes(m));

  const boardGroups: BoardGroup[] = groupOptions(
    rt.available.map((o) => ({
      id: o.id,
      roleIds: o.roleIds,
      label: optionLabel(o.roleIds, locale),
      fits: Boolean(myPool && fits(myPool, o.roleIds.length)),
    })),
    t,
    locale,
  );

  const MemberActions = ({ m, index }: { m: DraftSessionMember; index: number | null }) => {
    if (!access.manage || status !== "preparing") return null;
    return (
      <span className="flex flex-wrap items-center justify-end gap-1">
        {index !== null && index > 0 && (
          <ActionButton action={moveMemberAction.bind(null, id, m.id, -1)} label="↑" title={d.moveUp} />
        )}
        {index !== null && index < order.length - 1 && (
          <ActionButton action={moveMemberAction.bind(null, id, m.id, 1)} label="↓" title={d.moveDown} />
        )}
        {m.status !== "declined" && (
          <ActionButton action={updateMemberAction.bind(null, id, m.id, { drafts: !m.drafts })} label={m.drafts ? d.draftsOff : d.draftsOn} />
        )}
        {m.role !== "owner" && (
          <ActionButton
            action={updateMemberAction.bind(null, id, m.id, { role: m.role === "organizer" ? "participant" : "organizer" })}
            label={m.role === "organizer" ? d.makeParticipant : d.makeOrganizer}
          />
        )}
        {m.role !== "owner" && (
          <ActionButton action={removeMemberAction.bind(null, id, m.id)} label={d.remove} confirmText={d.removeConfirm(m.nickname)} variant="danger" />
        )}
      </span>
    );
  };

  const MemberRow = ({ m, index }: { m: DraftSessionMember; index: number | null }) => (
    <tr className={`border-b border-border last:border-0 ${m.status === "declined" ? "text-muted" : ""}`} data-testid={`member-${m.nickname}`}>
      <td className="p-3">{index !== null ? index + 1 : d.notDrafting}</td>
      <td className="p-3 font-medium">{m.nickname}</td>
      <td className="p-3">{d.memberRoles[m.role]}</td>
      <td className="p-3">{m.drafts ? "✓" : d.notDrafting}</td>
      <td className="p-3">{d.memberStatus[m.status]}</td>
      <td className="p-3"><MemberActions m={m} index={index} /></td>
    </tr>
  );

  // pick number, direction and pool size, under whose turn it is
  const turnDetails = (
    <>
      <p className="text-sm">
        {d.pickNumber(session.pickNumber)} · {d.direction}: {session.direction === 1 ? d.directionLabel.forward : d.directionLabel.back}
      </p>
      {myPool && session.mode === "personal" && <p className="font-medium">{d.yourPool(myPool.count, myPool.target)}</p>}
      {sharedPool && <p className="font-medium">{d.sharedPool(sharedPool.count, sharedPool.target)}</p>}
    </>
  );

  return (
    <div className="flex flex-col gap-8">
      {status === "active" && !onTurn && <AutoRefresh seconds={30} />}

      <div className="flex flex-col gap-2">
        <Link href="/admin/drafty" className="text-sm text-muted hover:underline">{d.back}</Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold">
          {draft.name}
          <StatusBadge t={t} status={status} prepState={review?.prepState} />
        </h1>
        <p className="text-sm text-muted">
          {modeSummary(t, session)}
          {session.startedAt && <> · {d.startedAt(formatStamp(session.startedAt, locale))}</>}
        </p>
        {draft.note && <p className="whitespace-pre-line">{draft.note}</p>}
        {session.completedAt && <p className="text-sm">{d.completedAt(formatStamp(session.completedAt, locale))}</p>}
        {session.cancelledAt && <p className="text-sm text-accent">{d.cancelledAt(formatStamp(session.cancelledAt, locale))}</p>}
      </div>

      {status === "preparing" && mine?.status === "invited" && (
        <Card className="flex flex-col gap-3 border-accent" id="invitation">
          <p className="font-medium">{d.invitation(d.memberRoles[mine.role])}</p>
          <span className="flex flex-wrap gap-2">
            <ActionButton action={respondInviteAction.bind(null, id, true)} label={d.accept} variant="primary" />
            <ActionButton action={respondInviteAction.bind(null, id, false)} label={d.decline} />
          </span>
        </Card>
      )}

      {status === "active" &&
        (onTurn ? (
          // the one thing a drafter must not miss: the whole box in the accent colour, a pulsing dot, the tab title
          <section id="turn" className="flex flex-col gap-2 rounded-xl border-2 border-accent bg-accent p-5 text-accent-foreground shadow-lg">
            <TurnTitle text={d.yourTurnTab} />
            <p className="flex items-center gap-3 text-2xl font-bold tracking-wide sm:text-3xl">
              <span aria-hidden className="relative flex h-3.5 w-3.5 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent-foreground opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-accent-foreground" />
              </span>
              {d.yourTurn}
            </p>
            <p className="font-medium">{d.yourTurnHint}</p>
            {turnDetails}
            {rt.available.length > 0 && (
              <a
                href="#pick"
                className="mt-1 self-start rounded-md bg-accent-foreground px-4 py-2 text-sm font-semibold text-accent hover:opacity-90"
              >
                {d.yourTurnJump}
              </a>
            )}
          </section>
        ) : (
          <Card className="flex flex-col gap-2" id="turn">
            {rt.current && <p className="text-xl font-bold">{d.waitingFor(rt.current.nickname)}</p>}
            {turnDetails}
            {access.drafter && <p className="text-sm text-muted">{d.comeBackLater}</p>}
          </Card>
        ))}

      {/* the order: who picks when; on turn and pool sizes while drafting */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{status === "preparing" ? d.membersTitle : d.orderTitle}</h2>
        {status === "preparing" ? (
          <>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm" data-testid="members">
                <thead className="text-left text-muted">
                  <tr className="border-b border-border">
                    <th className="p-3">{d.membersColumns.seat}</th>
                    <th className="p-3">{d.membersColumns.nickname}</th>
                    <th className="p-3">{d.membersColumns.role}</th>
                    <th className="p-3">{d.membersColumns.drafts}</th>
                    <th className="p-3">{d.membersColumns.status}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {order.map((m, i) => <MemberRow key={m.id} m={m} index={i} />)}
                  {others.map((m) => <MemberRow key={m.id} m={m} index={null} />)}
                </tbody>
              </table>
            </div>
            <span className="flex flex-wrap gap-2">
              {access.manage && order.length > 1 && <ActionButton action={shuffleOrderAction.bind(null, id)} label={d.shuffle} />}
              {mine?.status === "accepted" && mine.role !== "owner" && (
                <ActionButton action={respondInviteAction.bind(null, id, false)} label={d.leave} confirmText={d.leaveConfirm} />
              )}
            </span>
          </>
        ) : (
          <ol className="flex flex-wrap gap-2" data-testid="order">
            {order.map((m, i) => {
              const pool = mode.poolOf(m.id, rt.pools);
              const current = status === "active" && session.currentMemberId === m.id;
              return (
                <li
                  key={m.id}
                  aria-current={current ? "step" : undefined}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${current ? "border-accent bg-accent/10 font-semibold" : "border-border bg-card"}`}
                >
                  {i + 1}. {m.nickname}
                  {session.mode === "personal" && pool && <span className="ml-2 text-xs text-muted">{pool.count} / {pool.target}</span>}
                </li>
              );
            })}
          </ol>
        )}
        {status !== "preparing" && others.some((m) => m.status === "accepted") && (
          <p className="text-sm text-muted">
            {others
              .filter((m) => m.status === "accepted")
              .map((m) => `${m.nickname} (${d.memberRoles[m.role]})`)
              .join(", ")}
          </p>
        )}
      </section>

      {status === "preparing" && access.manage && (
        <Card>
          <h3 className="mb-3 font-semibold">{d.inviteTitle}</h3>
          <DraftInviteForm
            action={inviteMembersAction.bind(null, id)}
            accounts={invitable}
            t={{
              hint: d.inviteHint,
              none: d.inviteNone,
              role: d.inviteRole,
              roles: { participant: d.memberRoles.participant, organizer: d.memberRoles.organizer },
              drafts: d.inviteDrafts,
              submit: d.inviteSubmit,
              submitting: d.inviteSubmitting,
            }}
          />
        </Card>
      )}

      {review && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{d.checksTitle}</h2>
          <ul className="flex flex-col gap-1 text-sm" data-testid="start-checks">
            {review.checks.map((c) => <CheckLine key={c.kind} check={c} t={t} locale={locale} />)}
          </ul>
          {access.manage && (
            <span>
              {review.ready ? (
                <ActionButton action={startDraftAction.bind(null, id)} label={d.start} confirmText={d.startConfirm} variant="primary" />
              ) : (
                <Button type="button" disabled>{d.start}</Button>
              )}
            </span>
          )}
          <details className="rounded-xl border border-border bg-card p-4">
            <summary className="cursor-pointer font-medium">
              {d.offerTitle} – {plural(d.offered, totalRoles(review.offer.options))}
            </summary>
            <p className="mt-2 text-xs text-muted">{d.offerHint}</p>
            <div className="mt-3 flex flex-col gap-3">
              {groupOptions(review.offer.options, t, locale).map((g) => (
                <TeamSection key={g.group} group={g.group} label={g.label} count={g.options.length}>
                  <ul className="flex flex-wrap gap-1.5">
                    {g.options.map((o) => (
                      <li key={o.roleIds.join("+")}><OptionChips roleIds={o.roleIds} locale={locale} /></li>
                    ))}
                  </ul>
                </TeamSection>
              ))}
            </div>
          </details>
        </section>
      )}

      {status === "preparing" && access.manage && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{d.settingsTitle}</h2>
          <p className="text-sm text-muted">{d.settingsHint}</p>
          <Card>
            <DraftForm
              action={updateDraftAction.bind(null, id)}
              initial={draftFormInitial({ setup: draft, run: session })}
              {...draftFormProps(t, locale, d.form.save)}
            />
          </Card>
        </section>
      )}

      {status === "active" && (
        <section className="flex scroll-mt-4 flex-col gap-3" id="pick">
          <h2 className="text-lg font-semibold">{d.availableTitle}</h2>
          {rt.available.length === 0 ? (
            <p className="text-muted">{d.availableNone}</p>
          ) : (
            <PickBoard
              action={pickAction.bind(null, id)}
              pickNumber={session.pickNumber}
              onTurn={onTurn}
              groups={boardGroups}
              locale={locale}
              t={d.pickBoard}
            />
          )}
        </section>
      )}

      {status !== "preparing" && rt.pools.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{d.poolsTitle}</h2>
          <div className="grid gap-3 lg:grid-cols-2" data-testid="pools">
            {rt.pools.map((p) => (
              <Card key={p.id} className={`flex flex-col gap-2 ${myPool?.id === p.id ? "border-accent/60" : ""}`}>
                <h3 className="flex items-center justify-between gap-2 font-semibold">
                  {poolTitle(p.memberId)}
                  <span className="text-sm font-normal text-muted">{p.count} / {p.target}</span>
                </h3>
                {p.roleIds.length === 0 ? (
                  <p className="text-sm text-muted">{d.poolEmpty}</p>
                ) : (
                  <>
                    <TeamRows roleIds={p.roleIds} locale={locale} labels={t.admin.session.roleTeams} />
                    {/* what is drafted so far, also mid-draft – the pool as a script, named like one made from it */}
                    <a href={poolToolLink(p)} target="_blank" rel="noopener noreferrer" className={`${pill} self-start`}>{d.openInTool}</a>
                  </>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {status === "completed" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{d.scriptsTitle}</h2>
          <p className="text-sm text-muted">{d.scriptsHint}</p>
          <span className="flex flex-wrap gap-2">
            {rt.pools
              .filter((p) => canScriptPool(rows, access, p.memberId))
              .map((p) => (
                <ActionButton
                  key={p.id}
                  action={createScriptAction.bind(null, id, p.id)}
                  label={rt.pools.length > 1 ? `${d.createScript} (${poolTitle(p.memberId)})` : d.createScript}
                  variant="primary"
                />
              ))}
          </span>
          {scripts.length === 0 ? (
            <p className="text-muted">{d.scriptsNone}</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="scripts">
              {scripts.map(({ script, creator }) => (
                <li key={script.id}>
                  <Card className="flex flex-col gap-2">
                    <p className="font-semibold">
                      {script.name}
                      <span className="ml-2 text-sm font-normal text-muted">
                        {[creator && d.scriptBy(creator), d.scriptRoles(script.roleIds.length), d.scriptFrom(poolTitle(rt.pools.find((p) => p.id === script.poolId)?.memberId ?? null))]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </p>
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/drafty/script/${script.id}`} className={pill}>
                        {script.createdBy === me.id ? d.editScript : d.scriptTitle}
                      </Link>
                      <a href={scriptToolLink(script)} target="_blank" rel="noopener noreferrer" className={pill}>{d.openInTool}</a>
                      <a href={`/admin/drafty/script/${script.id}/script.json`} className={pill}>{d.downloadJson}</a>
                      {script.libraryScriptId && <Link href={`/admin/scripty/${script.libraryScriptId}`} className={pill}>{d.inLibrary}</Link>}
                      {script.createdBy === me.id && (
                        <>
                          <ActionButton
                            action={saveScriptToLibraryAction.bind(null, script.id)}
                            label={script.libraryScriptId ? d.updateInLibrary : d.saveToLibrary}
                          />
                          <ActionButton action={deleteScriptAction.bind(null, script.id)} label={d.deleteScript} confirmText={d.deleteScriptConfirm} variant="danger" />
                        </>
                      )}
                    </span>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {status !== "preparing" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{d.historyTitle}</h2>
          {rows.picks.length === 0 ? (
            <p className="text-muted">{d.historyNone}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm" data-testid="history">
                <thead className="text-left text-muted">
                  <tr className="border-b border-border">
                    <th className="p-3">{d.historyColumns.number}</th>
                    <th className="p-3">{d.historyColumns.who}</th>
                    <th className="p-3">{d.historyColumns.what}</th>
                    <th className="p-3">{d.historyColumns.when}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows.picks].reverse().map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="p-3 text-muted">{p.pickNumber}</td>
                      <td className="p-3">{nicknameOf.get(p.memberId) ?? "?"}</td>
                      <td className="p-3"><OptionChips roleIds={p.roleIds} locale={locale} /></td>
                      <td className="p-3 whitespace-nowrap text-muted">{formatStamp(p.createdAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {(access.cancel && (status === "preparing" || status === "active")) || access.remove ? (
        <span className="flex flex-wrap gap-2">
          {access.cancel && (status === "preparing" || status === "active") && (
            <ActionButton action={cancelDraftAction.bind(null, id)} label={d.cancel} confirmText={d.cancelConfirm} variant="danger" />
          )}
          {access.remove && (
            <ActionButton action={deleteDraftAction.bind(null, draft.id)} label={d.deleteDraft} confirmText={d.deleteDraftConfirm} variant="danger" />
          )}
        </span>
      ) : null}
    </div>
  );
}
