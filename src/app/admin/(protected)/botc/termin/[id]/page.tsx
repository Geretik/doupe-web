import { fullName } from "@/lib/names";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminCancelRegistrationAction, adminConfirmWaitlistedAction, adminErasePlayerAction, adminResendLinkAction, adminRestoreRegistrationAction, announceDiscordAction, deleteGameAction, deleteSessionAction, sendRemindersNowAction, setRegistrationStateAction, setScriptPollClosedAction, updateSessionAction } from "@/modules/botc/actions/sessions";
import { createGrimoireAction } from "@/modules/botc/actions/grimoire";
import { ActionButton } from "@/components/admin/action-button";
import { AttendanceToggle } from "@/modules/botc/components/admin/attendance-toggle";
import { BroadcastForm } from "@/modules/botc/components/admin/broadcast-form";
import { DeleteSessionButton } from "@/modules/botc/components/admin/delete-session-button";
import { EditablePlayerItem, EditablePlayerRow, type EditPlayerLabels, type EditPlayerProps } from "@/modules/botc/components/admin/edit-player";
import { GameForm, GameItem, type GameFormLabels, type RosterPlayer } from "@/modules/botc/components/admin/game-form";
import { GameRoster } from "@/modules/botc/components/game-roster";
import { GrimoireLink } from "@/modules/botc/components/grimoire/grimoire-link";
import { PresenceChart } from "@/modules/botc/components/admin/presence-chart";
import { QuickRegistrationForm } from "@/modules/botc/components/admin/quick-registration-form";
import { SessionForm } from "@/modules/botc/components/admin/session-form";
import { SubmitButton } from "@/components/admin/submit-button";
import { Alert, Card } from "@/components/ui";
import type { Registration } from "@/db/schema";
import type { Dict, Locale } from "@/i18n/dictionaries";
import { plural } from "@/i18n/plural";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { discordConfigured } from "@/lib/discord";
import { getFormSuggestions } from "@/modules/botc/lib/form-suggestions";
import { listGrimoires } from "@/modules/botc/lib/grimoire/service";
import { getSessionWithCount, listGamesForSession, listRegistrationsForSession } from "@/modules/botc/lib/queries";
import { presenceByHour } from "@/modules/botc/lib/presence";
import { countPendingReminders } from "@/modules/botc/lib/reminders";
import { dateToPragueLocal, formatDate, formatShortDate, formatTime } from "@/lib/time";
import { effectiveRegistrationState, scheduledOpening } from "@/modules/botc/lib/registration-state";
import { hasEmail, isAnonymized, isErased, playerPseudonym, RETENTION_DAYS, shownEmail } from "@/lib/retention";
import { storytellerStats, type StorytellerStats } from "@/modules/botc/lib/stats";
import { byVotes, scriptPollOpen, scriptPollResults } from "@/modules/botc/lib/script-poll";
import { editUrl } from "@/lib/site";
import { parseId } from "@/lib/validation";

function Flags({ r, past, t }: { r: Registration; past: boolean; t: Dict["admin"]["session"] }) {
  return (
    <>
      {r.canStorytell && <span title={t.storyteller} aria-label={t.storyteller}> 🎩</span>}
      {r.isNewbie && <span title={t.newbie} aria-label={t.newbie}> 🌱</span>}
      {/* after the game a missing confirmation does not matter any more */}
      {!past && r.status !== "cancelled" && !r.confirmationSentAt && hasEmail(r.email) && (
        <span title={t.noConfirmation} aria-label={t.noConfirmation}> ⚠️</span>
      )}
      {r.note && <span title={`${t.playerNote}: ${r.note}`} aria-label={t.playerNote}> 📝</span>}
    </>
  );
}

/** How often the player ran a game before, so storytelling can be shared fairly; for those who did or are willing to. */
function Storytold({ stats, willing, locale, t }: { stats?: StorytellerStats; willing: boolean; locale: Locale; t: Dict["admin"]["session"] }) {
  if (!stats && !willing) return null;
  return (
    <span className="block text-xs text-muted">
      {stats ? t.storytold(stats.games, formatShortDate(stats.lastAt, locale)) : t.neverStorytold}
    </span>
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
  const me = await requireAdmin();
  const numId = parseId((await params).id);
  if (!numId) notFound();
  const [{ locale, t: dict }, session, regs, pendingReminders, playedGames, suggestions, storytellers, sessionGrimoires] = await Promise.all([
    getDict(),
    getSessionWithCount(numId),
    listRegistrationsForSession(numId),
    countPendingReminders(numId),
    listGamesForSession(numId),
    getFormSuggestions(),
    storytellerStats(),
    listGrimoires(me, numId),
  ]);
  if (!session) notFound();
  const t = dict.admin.session;
  const poll = session.scriptPoll.length ? await scriptPollResults(session) : null;

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
  const willingStorytellers = confirmed.filter((r) => r.canStorytell).length;
  const newbies = confirmed.filter((r) => r.isNewbie).length;
  const attended = confirmed.filter((r) => r.attended === true).length;
  const noShow = confirmed.filter((r) => r.attended === false).length;
  const unconfirmed = past ? 0 : confirmed.filter((r) => !r.confirmationSentAt && hasEmail(r.email)).length;
  const full = confirmed.length >= session.capacity;
  const presence = presenceByHour(session, confirmed);
  const gameLabels: GameFormLabels = {
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
    gameSave: t.gameSave,
    gameSaving: t.gameSaving,
    gameCancel: t.gameCancel,
    rosterTitle: t.rosterTitle,
    rosterHint: t.rosterHint,
    rosterNobody: t.rosterNobody,
    roleUnknown: t.roleUnknown,
    roleSatOut: t.roleSatOut,
    linkedLabel: t.linkedLabel,
    bluffsTitle: t.bluffsTitle,
    bluffsHint: t.bluffsHint,
    linkedHint: t.linkedHint,
    roleStoryteller: t.roleStoryteller,
    roleOther: t.roleOther,
    roleTeams: t.roleTeams,
  };
  // who can get a character: the signed-up players, and anyone already entered in a game (even if they cancelled since)
  const rosterPlayers = new Map<number, RosterPlayer>(confirmed.map((r) => [r.id, { id: r.id, nickname: r.nickname }]));
  for (const g of playedGames) {
    for (const p of g.roster) {
      if (!rosterPlayers.has(p.registrationId)) rosterPlayers.set(p.registrationId, { id: p.registrationId, nickname: p.registration.nickname });
    }
  }
  const roster = [...rosterPlayers.values()].sort((a, b) => a.nickname.localeCompare(b.nickname, locale));
  const sessionStart = formatTime(session.startsAt, locale);
  const sessionEnd = formatTime(session.endsAt, locale);
  const playerLabels: Omit<EditPlayerLabels, "edit"> = {
    nickname: t.nickname,
    email: t.email,
    optional: dict.form.optional,
    firstName: dict.form.firstName,
    lastName: dict.form.lastName,
    phone: t.phone,
    arrival: t.arrival,
    departure: t.departure,
    arrivalDefault: dict.form.arrivalDefault,
    departureDefault: dict.form.departureDefault,
    arrivesLate: t.arrivesLate,
    storyteller: t.storyteller,
    newbie: t.newbie,
    note: t.playerNote,
    save: t.editPlayerSave,
    saving: t.editPlayerSaving,
    close: t.editPlayerClose,
  };
  /** Props of a player's edit form (the pencil); none for one erased at their request. */
  const editProps = (r: Registration): EditPlayerProps | null => {
    if (isErased(r.email)) return null;
    const deleted = isAnonymized(r.email);
    return {
      player: {
        id: r.id,
        nickname: r.nickname,
        email: shownEmail(r.email) ?? "",
        firstName: r.firstName,
        lastName: r.lastName,
        phone: r.phone,
        arrivalTime: r.arrivalTime,
        departureTime: r.departureTime,
        arrivesLate: r.arrivesLate,
        canStorytell: r.canStorytell,
        isNewbie: r.isNewbie,
        note: r.note,
      },
      arrivalMode: session.arrivalMode,
      start: sessionStart,
      end: sessionEnd,
      deleted,
      emailHint: deleted ? t.editPlayerDeletedHint(RETENTION_DAYS) : past ? undefined : t.editPlayerEmailHint,
      t: { ...playerLabels, edit: t.editPlayer(r.nickname) },
    };
  };
  const columns = session.arrivalMode === "times" ? 8 : 7;
  const storytold = new Map(storytellers.map((st) => [st.key, st]));
  const storytoldBy = (r: Registration) => (isErased(r.email) ? undefined : storytold.get(playerPseudonym(r.email)));

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
        <Link href={`/botc/termin/${session.id}`} className="rounded-md border border-border bg-card px-3 py-2 hover:border-accent">
          {t.publicPage}
        </Link>
        <Link href={`/admin/botc/novy?from=${session.id}`} className="rounded-md border border-border bg-card px-3 py-2 hover:border-accent">
          {t.duplicate}
        </Link>
        <a href={`/admin/botc/termin/${session.id}/export.csv`} className="rounded-md border border-border bg-card px-3 py-2 hover:border-accent">
          {t.exportCsv}
        </a>
        {!past && (
          <Link href={`/admin/botc/termin/${session.id}/plakat`} className="rounded-md border border-border bg-card px-3 py-2 hover:border-accent">
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
          suggestions={suggestions}
          t={dict.admin.form}
        />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.registered(confirmed.length, session.capacity)}</h2>
        <p className="text-sm text-muted">
          {t.summary(willingStorytellers, newbies)}
          {(attended > 0 || noShow > 0) && t.attendanceSummary(attended, noShow)}
        </p>
        {unconfirmed > 0 && <Alert kind="error">{t.noConfirmationCount(unconfirmed)}</Alert>}
        {dataDeleted && (
          <Alert kind="info">{t.anonymizedInfo(RETENTION_DAYS)}</Alert>
        )}
        <Card>
          <h3 className="mb-1 font-semibold">{t.quickTitle}</h3>
          <QuickRegistrationForm
            sessionId={session.id}
            t={{
              hint: t.quickHint,
              full: full ? t.quickFull(confirmed.length + 1) : null,
              nickname: t.nickname,
              email: t.email,
              emailHint: t.quickEmailHint,
              phone: t.phone,
              optional: dict.form.optional,
              more: t.quickMore,
              firstName: dict.form.firstName,
              lastName: dict.form.lastName,
              note: t.playerNote,
              storyteller: t.storyteller,
              newbie: t.newbie,
              submit: t.quickSubmit,
              submitting: t.quickSubmitting,
            }}
          />
        </Card>
        {confirmed.length === 0 && <p className="text-muted">{t.nobody}</p>}
        {confirmed.length > 0 && (
          <div className="@container overflow-x-auto rounded-xl border border-border bg-card">
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
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {confirmed.map((r) => {
                  const cells = (
                    <>
                      <td className="p-3 whitespace-nowrap">{fullName(r) ?? <span className="text-muted">–</span>}</td>
                      <td className="p-3 whitespace-nowrap">
                        {r.nickname}<Flags r={r} past={past} t={t} />
                        <Storytold stats={storytoldBy(r)} willing={r.canStorytell} locale={locale} t={t} />
                      </td>
                      <td className="p-3 whitespace-nowrap">{shownEmail(r.email) ? <a href={`mailto:${r.email}`} className="hover:underline">{r.email}</a> : <span className="text-muted">–</span>}</td>
                      <td className="p-3 whitespace-nowrap">{r.phone ? <a href={`tel:${r.phone}`} className="hover:underline">{r.phone}</a> : <span className="text-muted">–</span>}</td>
                      {session.arrivalMode === "late" ? (
                        <td className="p-3 whitespace-nowrap">{r.arrivesLate ? <strong>{t.late}</strong> : <span className="text-muted">{t.fromStart}</span>}</td>
                      ) : (
                        <>
                          <td className="p-3 whitespace-nowrap">{r.arrivalTime ?? sessionStart}</td>
                          <td className="p-3 whitespace-nowrap">{r.departureTime ?? sessionEnd}</td>
                        </>
                      )}
                      <td className="p-3">
                        <AttendanceToggle registrationId={r.id} attended={r.attended} labels={{ came: t.came, noShow: t.noShow }} />
                      </td>
                    </>
                  );
                  const actions = (
                    <>
                      <a href={editUrl(r.editToken)} className="mr-3 text-muted hover:underline" target="_blank" rel="noreferrer">{t.link}</a>
                      {hasEmail(r.email) && (
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
                      {!isErased(r.email) && (
                        <span className="mr-3">
                          <EraseButton registrationId={r.id} t={t} />
                        </span>
                      )}
                      <form action={adminCancelRegistrationAction.bind(null, r.id)} className="inline">
                        <SubmitButton variant="danger" confirmText={t.cancelConfirm(r.nickname)}>{t.cancel}</SubmitButton>
                      </form>
                    </>
                  );
                  return <EditablePlayerRow key={r.id} cells={cells} actions={actions} columns={columns} edit={editProps(r)} />;
                })}
                {confirmed.some((r) => r.note) && (
                  <tr className="bg-border/20 text-xs text-muted">
                    <td colSpan={columns} className="p-3">
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
              <EditablePlayerItem
                key={r.id}
                edit={editProps(r)}
                actions={
                  <>
                    <a href={editUrl(r.editToken)} className="self-center text-muted hover:underline" target="_blank" rel="noreferrer">{t.link}</a>
                    {!isErased(r.email) && <EraseButton registrationId={r.id} t={t} />}
                    <form action={adminConfirmWaitlistedAction.bind(null, r.id)}>
                      <SubmitButton variant="secondary">{full ? t.confirmFull : t.confirm}</SubmitButton>
                    </form>
                    <form action={adminCancelRegistrationAction.bind(null, r.id)}>
                      <SubmitButton variant="danger" confirmText={t.cancelConfirm(r.nickname)}>{t.cancel}</SubmitButton>
                    </form>
                  </>
                }
              >
                <span>
                  <span className="mr-2 font-semibold text-muted">{i + 1}.</span>
                  {fullName(r) ? `${fullName(r)} (${r.nickname}` : `(${r.nickname}`}<Flags r={r} past={past} t={t} />){shownEmail(r.email) && <> · {r.email}</>}{r.phone && <> · <a href={`tel:${r.phone}`} className="hover:underline">{r.phone}</a></>}
                </span>
              </EditablePlayerItem>
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
                  {!isErased(r.email) && <EraseButton registrationId={r.id} t={t} />}
                  {!isErased(r.email) && (
                    <form action={adminRestoreRegistrationAction.bind(null, r.id)}>
                      <SubmitButton variant="secondary" confirmText={t.restoreConfirm(r.nickname, full || waitlisted.length > 0)}>{t.restore}</SubmitButton>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {poll && (
        <Card id="hlasovani" className="scroll-mt-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">🗳️ {t.pollTitle}</h2>
            {session.startsAt > new Date() && (
              <ActionButton
                action={setScriptPollClosedAction.bind(null, session.id, !session.scriptPollClosedAt)}
                label={session.scriptPollClosedAt ? t.pollReopen : t.pollClose}
                pendingLabel="…"
              />
            )}
          </div>
          <p className="mb-3 text-sm text-muted">
            {scriptPollOpen(session) ? t.pollOpenInfo : session.startsAt > new Date() ? t.pollClosedInfo : t.pollEndedInfo}{" "}
            {t.pollVoters(poll.voters, confirmed.length + waitlisted.length)}
          </p>
          <ol className="flex flex-col gap-3 text-sm">
            {byVotes(poll.options).map((o) => (
              <li key={o.name} className="flex flex-col gap-1">
                <span className="flex flex-wrap justify-between gap-2">
                  {o.url ? <a href={o.url} className="font-medium hover:underline" target="_blank" rel="noreferrer">{o.name}</a> : <span className="font-medium">{o.name}</span>}
                  <span className="text-muted tabular-nums">{plural(dict.poll.votes, o.voters.length)}</span>
                </span>
                <span className="h-2 overflow-hidden rounded bg-border/40" aria-hidden>
                  <span className="block h-full rounded bg-accent/70" style={{ width: `${poll.voters ? (100 * o.voters.length) / poll.voters : 0}%` }} />
                </span>
                {o.voters.length > 0 && <span className="text-xs text-muted">{o.voters.join(", ")}</span>}
              </li>
            ))}
          </ol>
          {scriptPollOpen(session) && <p className="mt-3 text-xs text-muted">{t.pollNotifyHint}</p>}
        </Card>
      )}

      <Card id="hry" className="scroll-mt-4">
        <h2 className="mb-1 text-lg font-semibold">🎲 {t.gamesTitle}</h2>
        <p className="mb-4 text-sm text-muted">{t.gamesHint}</p>
        <section className="mb-4 flex flex-col gap-2 rounded-lg border border-border p-3" data-testid="session-grimoires">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted">{dict.grimoire.sessionCardHint}</span>
            <form action={createGrimoireAction}>
              <input type="hidden" name="sessionId" value={session.id} />
              <SubmitButton variant="secondary">{dict.grimoire.sessionNew}</SubmitButton>
            </form>
          </div>
          {sessionGrimoires.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {sessionGrimoires.map((g) => (
                <li key={g.id}>
                  <GrimoireLink item={g} t={dict} locale={locale} showOwner />
                </li>
              ))}
            </ul>
          )}
        </section>
        {playedGames.length === 0 && <p className="mb-4 text-sm text-muted">{t.gamesNone}</p>}
        {playedGames.length > 0 && (
          <ol className="mb-4 flex flex-col gap-2 text-sm">
            {playedGames.map((g, i) => (
              <GameItem
                key={g.id}
                sessionId={session.id}
                scripts={session.scripts}
                roster={roster}
                locale={locale}
                game={{
                  id: g.id,
                  scriptName: g.scriptName,
                  scriptUrl: g.scriptUrl,
                  winner: g.winner,
                  players: g.players,
                  notes: g.notes,
                  demonBluffs: g.demonBluffs,
                  roster: g.roster.map((p) => ({ registrationId: p.registrationId, role: p.role, believedRole: p.believedRole })),
                }}
                t={{ ...gameLabels, gameEdit: t.gameEdit }}
                deleteButton={
                  <form action={deleteGameAction.bind(null, g.id)}>
                    <SubmitButton variant="danger">{t.gameDelete}</SubmitButton>
                  </form>
                }
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span>
                    <span className="mr-2 font-semibold text-muted">{i + 1}.</span>
                    {g.scriptUrl ? <a href={g.scriptUrl} className="hover:underline" target="_blank" rel="noreferrer">{g.scriptName}</a> : g.scriptName}
                    {g.winner && <> · {g.winner === "good" ? "😇" : "😈"} {dict.archive.winner[g.winner]}</>}
                    {g.players && <span className="text-muted"> · {dict.archive.gamePlayers(g.players)}</span>}
                    {g.notes && <span className="text-muted"> · {g.notes}</span>}
                  </span>
                  <GameRoster players={g.roster} bluffs={g.demonBluffs} locale={locale} t={{ storyteller: dict.session.storytellerLabel, sides: dict.archive.sides, linked: dict.archive.linked, satOut: dict.archive.satOut }} />
                </div>
              </GameItem>
            ))}
          </ol>
        )}
        <GameForm sessionId={session.id} scripts={session.scripts} roster={roster} locale={locale} t={gameLabels} />
      </Card>

      {!past && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">{t.broadcastTitle}</h2>
          <p className="mb-4 text-sm text-muted">{t.broadcastHint}</p>
          <BroadcastForm
            sessionId={session.id}
            confirmedCount={confirmed.filter((r) => hasEmail(r.email)).length}
            waitlistedCount={waitlisted.filter((r) => hasEmail(r.email)).length}
            t={dict.admin.broadcast}
          />
        </Card>
      )}
    </div>
  );
}
