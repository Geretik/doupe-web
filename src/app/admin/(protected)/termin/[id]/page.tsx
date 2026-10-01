import { fullName } from "@/lib/names";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  adminCancelRegistrationAction,
  adminConfirmWaitlistedAction,
  adminErasePlayerAction,
  adminResendLinkAction,
  adminRestoreRegistrationAction,
  announceDiscordAction,
  autoAssignTablesAction,
  clearTablesAction,
  createTablesAction,
  deleteGameAction,
  sendTablesEmailAction,
  setTableStorytellerAction,
  deleteSessionAction,
  sendRemindersNowAction,
  setRegistrationStateAction,
  updateSessionAction,
} from "@/app/actions/admin";
import { ActionButton } from "@/components/admin/action-button";
import { AttendanceToggle } from "@/components/admin/attendance-toggle";
import { BroadcastForm } from "@/components/admin/broadcast-form";
import { DeleteSessionButton } from "@/components/admin/delete-session-button";
import { GameForm } from "@/components/admin/game-form";
import { PresenceChart } from "@/components/admin/presence-chart";
import { TableSelect } from "@/components/admin/table-select";
import { SessionForm } from "@/components/admin/session-form";
import { Alert, Button, Card } from "@/components/ui";
import type { Registration } from "@/db/schema";
import type { Dict } from "@/i18n/dictionaries";
import { getDict } from "@/i18n/server";
import { discordConfigured } from "@/lib/discord";
import { getSessionWithCount, listGamesForSession, listRegistrationsForSession } from "@/lib/queries";
import { presenceByHour } from "@/lib/presence";
import { countPendingReminders } from "@/lib/reminders";
import { listTables, tableIssues, TABLE_MAX } from "@/lib/tables";
import { dateToPragueLocal, formatDate, formatShortDate, formatTime } from "@/lib/time";
import { effectiveRegistrationState, scheduledOpening } from "@/lib/registration-state";
import { isAnonymized, RETENTION_DAYS, shownEmail } from "@/lib/retention";
import { editUrl } from "@/lib/site";

function Flags({ r, t }: { r: Registration; t: Dict["admin"]["session"] }) {
  return (
    <>
      {r.canStorytell && <span title={t.storyteller} aria-label={t.storyteller}> 🎩</span>}
      {r.isNewbie && <span title={t.newbie} aria-label={t.newbie}> 🌱</span>}
      {r.status !== "cancelled" && !r.confirmationSentAt && (
        <span title={t.noConfirmation} aria-label={t.noConfirmation}> ⚠️</span>
      )}
      {r.note && <span title={`${t.playerNote}: ${r.note}`} aria-label={t.playerNote}> 📝</span>}
    </>
  );
}

/** Deletes the player's personal data at their request, in all their sign-ups. */
function EraseButton({ registrationId, t }: { registrationId: number; t: Dict["admin"]["session"] }) {
  return (
    <ActionButton
      action={adminErasePlayerAction.bind(null, registrationId)}
      label="🗑️"
      pendingLabel="…"
      title={t.erase}
      confirmText={t.eraseConfirm}
    />
  );
}

export default async function AdminSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) notFound();
  const [{ locale, t: dict }, session, regs, pendingReminders, playedGames, sessionTables] = await Promise.all([
    getDict(),
    getSessionWithCount(numId),
    listRegistrationsForSession(numId),
    countPendingReminders(numId),
    listGamesForSession(numId),
    listTables(numId),
  ]);
  if (!session) notFound();
  const t = dict.admin.session;

  const confirmed = regs.filter((r) => r.status === "confirmed");
  const waitlisted = regs
    .filter((r) => r.status === "waitlisted")
    .sort((a, b) => (a.waitlistedAt?.getTime() ?? 0) - (b.waitlistedAt?.getTime() ?? 0));
  const cancelled = regs.filter((r) => r.status === "cancelled");
  const past = session.endsAt < new Date();
  const regState = effectiveRegistrationState(session);
  const opensAt = scheduledOpening(session);
  /** the daily cron has deleted the players' names, e-mails and phones */
  const dataDeleted = session.endsAt < new Date(new Date().getTime() - RETENTION_DAYS * 864e5);
  const storytellers = confirmed.filter((r) => r.canStorytell).length;
  const newbies = confirmed.filter((r) => r.isNewbie).length;
  const attended = confirmed.filter((r) => r.attended === true).length;
  const noShow = confirmed.filter((r) => r.attended === false).length;
  const unconfirmed = confirmed.filter((r) => !r.confirmationSentAt).length;
  const tableOptions = sessionTables.map((tb) => ({ id: tb.id, label: t.table(tb.number) }));
  const unassigned = sessionTables.length ? confirmed.filter((r) => !r.tableId).length : 0;
  const suggestedTables = Math.max(2, Math.ceil(confirmed.length / TABLE_MAX));
  const presence = presenceByHour(session, confirmed);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="flex items-center gap-3 text-2xl font-bold">{session.title}</h1>
        <DeleteSessionButton
          action={deleteSessionAction.bind(null, session.id)}
          label={t.deleteSession}
          confirmText={t.deleteConfirm}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/termin/${session.id}`} className="rounded-md border border-border bg-card px-3 py-2 hover:border-accent">
          {t.publicPage}
        </Link>
        <Link href={`/admin/novy?from=${session.id}`} className="rounded-md border border-border bg-card px-3 py-2 hover:border-accent">
          {t.duplicate}
        </Link>
        <a href={`/admin/termin/${session.id}/export.csv`} className="rounded-md border border-border bg-card px-3 py-2 hover:border-accent">
          {t.exportCsv}
        </a>
        {!past && (
          <Link href={`/admin/termin/${session.id}/plakat`} className="rounded-md border border-border bg-card px-3 py-2 hover:border-accent">
            {t.poster}
          </Link>
        )}
        {!past && (
          <ActionButton
            action={setRegistrationStateAction.bind(null, session.id, regState === "open" ? "paused" : "open")}
            label={regState === "open" ? t.pauseRegistration : opensAt ? t.openNow : t.openRegistration}
            pendingLabel="…"
            variant={regState === "open" ? "secondary" : "primary"}
          />
        )}
        {!past && (
          <ActionButton
            action={sendRemindersNowAction.bind(null, session.id)}
            label={t.sendReminder(pendingReminders)}
            pendingLabel={t.sending}
            confirmText={t.sendReminderConfirm(pendingReminders)}
          />
        )}
        {!past && (
          <ActionButton
            action={announceDiscordAction.bind(null, session.id)}
            label={t.announceDiscord}
            pendingLabel={t.sending}
            confirmText={discordConfigured() ? t.announceDiscordConfirm : undefined}
          />
        )}
      </div>

      {!past && opensAt && (
        <Alert kind="info">{t.scheduledOpening(formatShortDate(opensAt, locale), formatTime(opensAt, locale))}</Alert>
      )}

      <Card>
        <h2 className="mb-4 text-lg font-semibold">{t.edit}</h2>
        <SessionForm
          action={updateSessionAction.bind(null, session.id)}
          session={session}
          mode="edit"
          defaults={{
            startsAt: dateToPragueLocal(session.startsAt),
            endsAt: dateToPragueLocal(session.endsAt),
            // once a scheduled opening has passed, the form shows the sign-ups as open
            registrationState: regState,
            registrationOpensAt: opensAt ? dateToPragueLocal(opensAt) : "",
          }}
          today={dateToPragueLocal(new Date()).slice(0, 10)}
          t={dict.admin.form}
        />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.registered(confirmed.length, session.capacity)}</h2>
        <p className="text-sm text-muted">
          {t.summary(storytellers, newbies)}
          {(attended > 0 || noShow > 0) && t.attendanceSummary(attended, noShow)}
        </p>
        {unconfirmed > 0 && <Alert kind="error">{t.noConfirmationCount(unconfirmed)}</Alert>}
        {dataDeleted && (
          <Alert kind="info">{t.anonymizedInfo(RETENTION_DAYS)}</Alert>
        )}
        {confirmed.length === 0 && <p className="text-muted">{t.nobody}</p>}
        {confirmed.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="p-3">{t.name}</th>
                  <th className="p-3">{t.nickname}</th>
                  <th className="p-3">{t.email}</th>
                  <th className="p-3">{t.phone}</th>
                  <th className="p-3">{t.arrival}</th>
                  {session.arrivalMode === "times" && <th className="p-3">{t.departure}</th>}
                  <th className="p-3" title={t.attendance}>{t.attended}</th>
                  {sessionTables.length > 0 && <th className="p-3">{t.tableColumn}</th>}
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {confirmed.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="p-3 whitespace-nowrap">{fullName(r) ?? <span className="text-muted">–</span>}</td>
                    <td className="p-3 whitespace-nowrap">{r.nickname}<Flags r={r} t={t} /></td>
                    <td className="p-3 whitespace-nowrap">{shownEmail(r.email) ? <a href={`mailto:${r.email}`} className="hover:underline">{r.email}</a> : <span className="text-muted">–</span>}</td>
                    <td className="p-3 whitespace-nowrap">{r.phone ? <a href={`tel:${r.phone}`} className="hover:underline">{r.phone}</a> : <span className="text-muted">–</span>}</td>
                    {session.arrivalMode === "late" ? (
                      <td className="p-3 whitespace-nowrap">{r.arrivesLate ? <strong>{t.late}</strong> : <span className="text-muted">{t.fromStart}</span>}</td>
                    ) : (
                      <>
                        <td className="p-3 whitespace-nowrap">{r.arrivalTime ?? formatTime(session.startsAt, locale)}</td>
                        <td className="p-3 whitespace-nowrap">{r.departureTime ?? formatTime(session.endsAt, locale)}</td>
                      </>
                    )}
                    <td className="p-3">
                      <AttendanceToggle registrationId={r.id} attended={r.attended} labels={{ came: t.came, noShow: t.noShow }} />
                    </td>
                    {sessionTables.length > 0 && (
                      <td className="p-3">
                        <TableSelect registrationId={r.id} tableId={r.tableId} options={tableOptions} noneLabel={t.tableNone} />
                      </td>
                    )}
                    <td className="p-3 text-right whitespace-nowrap">
                      <a href={editUrl(r.editToken)} className="mr-3 text-muted hover:underline" target="_blank" rel="noreferrer">{t.link}</a>
                      {!isAnonymized(r.email) && (
                        <span className="mr-3">
                          <ActionButton
                            action={adminResendLinkAction.bind(null, r.id)}
                            label="✉️"
                            pendingLabel="…"
                            title={t.resendLink}
                            confirmText={t.resendLinkConfirm}
                          />
                        </span>
                      )}
                      {!isAnonymized(r.email) && (
                        <span className="mr-3">
                          <EraseButton registrationId={r.id} t={t} />
                        </span>
                      )}
                      <form action={adminCancelRegistrationAction.bind(null, r.id)} className="inline">
                        <Button type="submit" variant="danger">{t.cancel}</Button>
                      </form>
                    </td>
                  </tr>
                ))}
                {confirmed.some((r) => r.note) && (
                  <tr className="bg-border/20 text-xs text-muted">
                    <td colSpan={sessionTables.length > 0 ? 9 : 8} className="p-3">
                      <strong>{t.playerNote}:</strong>{" "}
                      {confirmed.filter((r) => r.note).map((r) => `${r.nickname}: „${r.note}“`).join(" · ")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {confirmed.some((r) => shownEmail(r.email)) && (
          <p className="text-xs text-muted">
            {t.allEmails}<span className="select-all">{confirmed.flatMap((r) => shownEmail(r.email) ?? []).join(", ")}</span>
          </p>
        )}
        {confirmed.length > 0 && session.arrivalMode === "times" && (
          <Card>
            <h3 className="mb-1 font-semibold">🕒 {t.presenceTitle}</h3>
            <p className="mb-3 text-sm text-muted">{t.presenceHint}</p>
            <PresenceChart slots={presence} total={confirmed.length} allLabel={t.presenceAll} />
          </Card>
        )}
      </section>

      {waitlisted.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t.waitlist(waitlisted.length)}</h2>
          <p className="text-sm text-muted">{t.waitlistHint}</p>
          <ol className="flex flex-col gap-2 text-sm">
            {waitlisted.map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
                <span>
                  <span className="mr-2 font-semibold text-muted">{i + 1}.</span>
                  {fullName(r) ? `${fullName(r)} (${r.nickname}` : `(${r.nickname}`}<Flags r={r} t={t} />){shownEmail(r.email) && <> · {r.email}</>}{r.phone && <> · <a href={`tel:${r.phone}`} className="hover:underline">{r.phone}</a></>}
                </span>
                <span className="flex gap-2">
                  <a href={editUrl(r.editToken)} className="self-center text-muted hover:underline" target="_blank" rel="noreferrer">{t.link}</a>
                  {!isAnonymized(r.email) && <EraseButton registrationId={r.id} t={t} />}
                  <form action={adminConfirmWaitlistedAction.bind(null, r.id)}>
                    <Button type="submit" variant="secondary">{t.confirm}</Button>
                  </form>
                  <form action={adminCancelRegistrationAction.bind(null, r.id)}>
                    <Button type="submit" variant="danger">{t.cancel}</Button>
                  </form>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {cancelled.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-muted">{t.cancelled(cancelled.length)}</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {cancelled.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
                <span className="text-muted">
                  {fullName(r) ? `${fullName(r)} (${r.nickname})` : r.nickname}{shownEmail(r.email) && <> · {r.email}</>}
                  {r.cancelledAt && <> · {t.cancelledAt} {formatDate(r.cancelledAt, locale)} {formatTime(r.cancelledAt, locale)}</>}
                  {r.cancelReason && <> · {t.cancelReason}: „{r.cancelReason}“</>}
                </span>
                <span className="flex gap-2">
                  {!isAnonymized(r.email) && <EraseButton registrationId={r.id} t={t} />}
                  <form action={adminRestoreRegistrationAction.bind(null, r.id)}>
                    <Button type="submit" variant="secondary">{t.restore}</Button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirmed.length >= 2 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">🪑 {t.tablesTitle}</h2>
          <p className="mb-4 text-sm text-muted">{t.tablesHint}</p>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            {[suggestedTables, suggestedTables + 1].map((n) => (
              <form key={n} action={createTablesAction.bind(null, session.id, n)}>
                <Button type="submit" variant="secondary">{t.tablesCreate(n)}</Button>
              </form>
            ))}
            {sessionTables.length > 0 && (
              <>
                <form action={autoAssignTablesAction.bind(null, session.id)}>
                  <Button type="submit" variant="secondary">{t.tablesAuto}</Button>
                </form>
                <ActionButton
                  action={sendTablesEmailAction.bind(null, session.id)}
                  label={t.tablesSend(confirmed.length - unassigned)}
                  pendingLabel={t.sending}
                  confirmText={t.tablesSendConfirm}
                  variant="primary"
                />
                <DeleteSessionButton action={clearTablesAction.bind(null, session.id)} label={t.tablesClear} confirmText={t.tablesClearConfirm} />
                {unassigned > 0 && <span className="text-accent">⚠️ {t.tableUnassigned(unassigned)}</span>}
              </>
            )}
          </div>
          {sessionTables.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sessionTables.map((tb) => {
                const issues = tableIssues(tb, { tooSmall: t.tableTooSmall, tooBig: t.tableTooBig, noStoryteller: t.tableNoStoryteller });
                return (
                  <div key={tb.id} className="flex flex-col gap-2 rounded-xl border border-border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <strong>{t.table(tb.number)} · {tb.players.length}</strong>
                      {tb.notifiedAt && <span className="text-xs text-muted">✉️ {t.tablesNotified}</span>}
                    </div>
                    {issues.length > 0 && <p className="text-xs text-accent">⚠️ {issues.join(" · ")}</p>}
                    <form action={setTableStorytellerAction.bind(null, tb.id)} className="flex gap-2">
                      <input
                        name="storyteller"
                        defaultValue={tb.storyteller ?? ""}
                        placeholder={`🎩 ${t.tableStoryteller}`}
                        aria-label={t.tableStoryteller}
                        className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
                      />
                      <Button type="submit" variant="secondary">OK</Button>
                    </form>
                    <ul className="flex flex-col gap-0.5">
                      {tb.players.map((p) => (
                        <li key={p.id}>{p.nickname}<Flags r={p} t={t} /></li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <Card>
        <h2 className="mb-1 text-lg font-semibold">🎲 {t.gamesTitle}</h2>
        <p className="mb-4 text-sm text-muted">{t.gamesHint}</p>
        {playedGames.length === 0 && <p className="mb-4 text-sm text-muted">{t.gamesNone}</p>}
        {playedGames.length > 0 && (
          <ol className="mb-4 flex flex-col gap-2 text-sm">
            {playedGames.map((g, i) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <span>
                  <span className="mr-2 font-semibold text-muted">{i + 1}.</span>
                  {g.scriptUrl ? <a href={g.scriptUrl} className="hover:underline" target="_blank" rel="noreferrer">{g.scriptName}</a> : g.scriptName}
                  {g.winner && <> · {g.winner === "good" ? "😇" : "😈"} {dict.archive.winner[g.winner]}</>}
                  {g.players && <span className="text-muted"> · {dict.archive.gamePlayers(g.players)}</span>}
                  {g.notes && <span className="text-muted"> · {g.notes}</span>}
                </span>
                <form action={deleteGameAction.bind(null, g.id)}>
                  <Button type="submit" variant="danger">{t.gameDelete}</Button>
                </form>
              </li>
            ))}
          </ol>
        )}
        <GameForm
          sessionId={session.id}
          scripts={session.scripts}
          t={{
            gameScript: t.gameScript,
            gameScriptCustom: t.gameScriptCustom,
            gameWinner: t.gameWinner,
            gameWinnerUnknown: t.gameWinnerUnknown,
            gameWinnerGood: t.gameWinnerGood,
            gameWinnerEvil: t.gameWinnerEvil,
            gamePlayers: t.gamePlayers,
            gameNotes: t.gameNotes,
            gameAdd: t.gameAdd,
            gameAdding: t.gameAdding,
          }}
        />
      </Card>

      {!past && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">{t.broadcastTitle}</h2>
          <p className="mb-4 text-sm text-muted">{t.broadcastHint}</p>
          <BroadcastForm
            sessionId={session.id}
            confirmedCount={confirmed.length}
            waitlistedCount={waitlisted.length}
            t={dict.admin.broadcast}
          />
        </Card>
      )}
    </div>
  );
}
