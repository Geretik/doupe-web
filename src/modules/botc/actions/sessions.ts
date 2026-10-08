"use server";

import { and, eq, inArray, ne, notLike, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { games, registrations, scriptVotes, sessions, type RegistrationState } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { saveRoster } from "@/modules/botc/lib/game-roster";
import { rotateFeedKey } from "@/modules/botc/lib/org-feed";
import { announceSessionOnDiscord } from "@/lib/discord";
import { sendBroadcastEmail, sendConfirmationEmail, sendExistingRegistrationEmail, sendPromotedEmail } from "@/modules/botc/lib/registration-email";
import { sendDueReminders } from "@/modules/botc/lib/reminders";
import { getDict } from "@/i18n/server";
import { generateEditToken } from "@/lib/token";
import { addPragueDays, pragueLocalToDate } from "@/lib/time";
import {
  adminRegistrationEditSchema,
  broadcastSchema,
  fieldErrorsOf,
  gameSchema,
  repeatSchema,
  parsePlaylist,
  parseBluffs,
  parseRoster,
  parseScriptPoll,
  parseScripts,
  quickRegistrationSchema,
  sessionSchema,
  timeRangeErrors,
  type FormState,
} from "@/lib/validation";
import { promoteWaitlist } from "@/modules/botc/lib/waitlist";
import { ANON_SUFFIX, erasedFields, hasEmail, isAnonymized, isErased, noEmailAddress, playerPseudonym } from "@/lib/retention";
import type { SimpleResult } from "@/app/actions/admin";

/** Sessions are evenings: arrival and departure are picked as times of day, so a session must stay under a day. */
const MAX_SESSION_HOURS = 24;

async function parseSessionForm(formData: FormData) {
  const { t } = await getDict();
  const e = t.admin.errors;
  const parsed = sessionSchema(e).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: fieldErrorsOf(parsed.error), message: e.checkForm };
  }
  const startsAt = pragueLocalToDate(parsed.data.startsAt);
  const endsAt = pragueLocalToDate(parsed.data.endsAt);
  if (!startsAt) return { error: { startsAt: [e.invalidStart] }, message: e.checkForm };
  if (!endsAt) return { error: { endsAt: [e.invalidEnd] }, message: e.checkForm };
  if (endsAt <= startsAt) return { error: { endsAt: [e.endAfterStart] }, message: e.checkForm };
  if (endsAt.getTime() - startsAt.getTime() >= MAX_SESSION_HOURS * 3600_000) {
    return { error: { endsAt: [e.sessionTooLong(MAX_SESSION_HOURS)] }, message: e.checkForm };
  }
  const scripts = parseScripts(formData, e);
  if (scripts.error) return { error: { scripts: scripts.error }, message: e.checkForm };
  const playlist = parsePlaylist(formData.get("playlist"));
  if (playlist.error) return { error: { playlist: [e.playlistInvalid] }, message: e.checkForm };
  const poll = parseScriptPoll(formData, e);
  if (poll.error) return { error: { scriptPoll: poll.error }, message: e.checkForm };
  let registrationOpensAt: Date | null = null;
  if (parsed.data.registrationState !== "open" && parsed.data.registrationOpensAt) {
    registrationOpensAt = pragueLocalToDate(parsed.data.registrationOpensAt);
    if (!registrationOpensAt) return { error: { registrationOpensAt: [e.invalidOpensAt] }, message: e.checkForm };
    if (registrationOpensAt <= new Date()) return { error: { registrationOpensAt: [e.opensAtPast] }, message: e.checkForm };
    if (registrationOpensAt >= endsAt) return { error: { registrationOpensAt: [e.opensAtAfterEnd] }, message: e.checkForm };
  }
  return {
    values: {
      scripts: scripts.scripts,
      playlist: playlist.playlist,
      scriptPoll: poll.options,
      title: parsed.data.title,
      place: parsed.data.place,
      capacity: parsed.data.capacity,
      gameLanguage: parsed.data.gameLanguage,
      arrivalMode: parsed.data.arrivalMode,
      phoneRequired: parsed.data.phoneRequired,
      registrationState: parsed.data.registrationState,
      registrationOpensAt,
      storyteller: parsed.data.storyteller,
      note: parsed.data.note,
      startsAt,
      endsAt,
    },
  };
}

export async function createSessionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const r = await parseSessionForm(formData);
  if (r.error) return { error: r.message, fieldErrors: r.error };
  // optional series: the same session every N weeks, `repeatCount` times in total
  const repeat = repeatSchema.safeParse(Object.fromEntries(formData.entries()));
  const weeks = repeat.success ? repeat.data.repeatWeeks : 0;
  const count = repeat.success && weeks > 0 ? repeat.data.repeatCount : 1;
  const rows = Array.from({ length: count }, (_, i) => {
    // the same Prague time each week, also across a daylight-saving change
    const days = i * weeks * 7;
    const opensAt = r.values.registrationOpensAt;
    return {
      ...r.values,
      startsAt: addPragueDays(r.values.startsAt, days),
      endsAt: addPragueDays(r.values.endsAt, days),
      registrationOpensAt: opensAt && addPragueDays(opensAt, days),
    };
  });
  const [created] = await db.insert(sessions).values(rows).returning();
  if (formData.get("announceDiscord") === "on") {
    await announceSessionOnDiscord(created, created.capacity);
  }
  revalidatePath("/botc");
  redirect("/admin/botc");
}

export async function updateSessionAction(
  id: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const r = await parseSessionForm(formData);
  if (r.error) return { error: r.message, fieldErrors: r.error };
  const [before] = await db.select({ startsAt: sessions.startsAt }).from(sessions).where(eq(sessions.id, id));
  if (!before) return { error: (await getDict()).t.admin.errors.noSession };
  const moved = before.startsAt.getTime() !== r.values.startsAt.getTime();
  // a moved session gets its reminders and "spots left" post again, for the new date
  await db.update(sessions).set({ ...r.values, ...(moved ? { spotsPostedAt: null } : {}) }).where(eq(sessions.id, id));
  if (moved) await db.update(registrations).set({ reminderSentAt: null }).where(eq(registrations.sessionId, id));
  // a bigger capacity may make room for waitlisted players
  await promoteWaitlist(id);
  revalidateSession(id);
  return { ok: true };
}

export async function deleteSessionAction(id: number) {
  await requireAdmin();
  await db.delete(sessions).where(eq(sessions.id, id));
  revalidatePath("/botc");
  redirect("/admin/botc");
}

function revalidateSession(sessionId: number) {
  revalidatePath("/botc");
  revalidatePath(`/botc/termin/${sessionId}`);
  revalidatePath(`/admin/botc/termin/${sessionId}`);
}

export async function adminCancelRegistrationAction(registrationId: number) {
  await requireAdmin();
  const now = new Date();
  const [row] = await db
    .update(registrations)
    // the reason of an earlier cancellation by the player does not apply to this one
    .set({ status: "cancelled", waitlistedAt: null, cancelledAt: now, cancelReason: null, updatedAt: now })
    .where(and(eq(registrations.id, registrationId), inArray(registrations.status, ["confirmed", "waitlisted"])))
    .returning({ sessionId: registrations.sessionId });
  if (row) {
    await promoteWaitlist(row.sessionId);
    revalidateSession(row.sessionId);
  }
}

/** One-click "open" / "pause" of new sign-ups from the admin session page. */
export async function setRegistrationStateAction(sessionId: number, state: RegistrationState): Promise<SimpleResult> {
  await requireAdmin();
  const { t } = await getDict();
  // a manual switch replaces any scheduled opening
  await db.update(sessions).set({ registrationState: state, registrationOpensAt: null }).where(eq(sessions.id, sessionId));
  revalidateSession(sessionId);
  return { ok: true, message: state === "open" ? t.admin.session.registrationOpened : t.admin.session.registrationPaused };
}

/** One-click end of the script vote from the admin session page, or opening it again. */
export async function setScriptPollClosedAction(sessionId: number, closed: boolean): Promise<SimpleResult> {
  await requireAdmin();
  const { t } = await getDict();
  await db.update(sessions).set({ scriptPollClosedAt: closed ? new Date() : null }).where(eq(sessions.id, sessionId));
  revalidateSession(sessionId);
  return { ok: true, message: closed ? t.admin.session.pollClosedNow : t.admin.session.pollReopenedNow };
}

/**
 * Right to erasure on request: deletes everything personal in all the player's sign-ups and cancels the
 * ones for sessions that are not over yet. Sign-ups are matched by e-mail – including the older ones
 * whose e-mail the daily cron already replaced by the player's pseudonym.
 */
export async function adminErasePlayerAction(registrationId: number): Promise<SimpleResult> {
  await requireAdmin();
  const { t } = await getDict();
  const reg = await db.query.registrations.findFirst({ where: eq(registrations.id, registrationId) });
  if (!reg) return { message: t.errors.regNotFound };
  if (isErased(reg.email)) return { ok: true, message: t.admin.session.erased(0) };
  const now = new Date();
  // the same for the address and for its stand-in, so it also works from an already anonymised sign-up
  const pseudonym = playerPseudonym(reg.email);
  const candidates = await db
    .select({ id: registrations.id, email: registrations.email, status: registrations.status, sessionId: registrations.sessionId, endsAt: sessions.endsAt })
    .from(registrations)
    .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
    // anonymised rows by their pseudonym; the rest (recent and upcoming sessions only) are compared below
    .where(or(eq(registrations.email, pseudonym), notLike(registrations.email, `%${ANON_SUFFIX}`)));
  const rows = candidates.filter((r) => r.email === pseudonym || playerPseudonym(r.email) === pseudonym);
  const freed = new Set<number>();
  for (const r of rows) {
    const active = r.status !== "cancelled" && r.endsAt >= now;
    await db
      .update(registrations)
      .set({
        ...erasedFields(),
        ...(active ? { status: "cancelled" as const, waitlistedAt: null, cancelledAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(registrations.id, r.id));
    if (active) freed.add(r.sessionId);
  }
  if (rows.length) await db.delete(scriptVotes).where(inArray(scriptVotes.registrationId, rows.map((r) => r.id)));
  for (const id of freed) await promoteWaitlist(id);
  for (const id of new Set(rows.map((r) => r.sessionId))) revalidateSession(id);
  return { ok: true, message: t.admin.session.erased(rows.length) };
}

/** Restores a cancelled registration: into a free spot, or onto the waitlist when full. */
export async function adminRestoreRegistrationAction(registrationId: number) {
  await requireAdmin();
  const row = await db.transaction(async (tx) => {
    const reg = await tx.query.registrations.findFirst({
      where: eq(registrations.id, registrationId),
    });
    // only a cancelled one (a double click must not move the restored player to the end of the waitlist),
    // and not one erased at the player's request
    if (!reg || reg.status !== "cancelled" || isErased(reg.email)) return null;
    const [session] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.id, reg.sessionId))
      .for("update");
    const [{ confirmed, waitlisted }] = await tx
      .select({
        confirmed: sql<number>`count(*) filter (where ${registrations.status} = 'confirmed')::int`,
        waitlisted: sql<number>`count(*) filter (where ${registrations.status} = 'waitlisted')::int`,
      })
      .from(registrations)
      .where(eq(registrations.sessionId, reg.sessionId));
    const full = confirmed >= session.capacity || waitlisted > 0;
    const now = new Date();
    await tx
      .update(registrations)
      .set({
        status: full ? "waitlisted" : "confirmed",
        waitlistedAt: full ? now : null,
        cancelledAt: null,
        cancelReason: null,
        updatedAt: now,
      })
      .where(and(eq(registrations.id, registrationId), eq(registrations.status, "cancelled")));
    return reg;
  });
  if (row) revalidateSession(row.sessionId);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * After an organiser seated a player beyond the free spots: raises the capacity to the number of confirmed
 * players (one more spot), so nobody is over the limit and the waitlist keeps its place. Run it in the
 * transaction that locked the session row. Returns the new capacity, or null when it did not change.
 */
async function fitCapacity(tx: Tx, sessionId: number, capacity: number) {
  const [{ c }] = await tx
    .select({ c: sql<number>`count(*)::int` })
    .from(registrations)
    .where(and(eq(registrations.sessionId, sessionId), eq(registrations.status, "confirmed")));
  if (c <= capacity) return null;
  await tx.update(sessions).set({ capacity: c }).where(eq(sessions.id, sessionId));
  return c;
}

/** Seats a waitlisted player right away – one more spot when the session is full – and e-mails them as when a spot opens up. */
export async function adminConfirmWaitlistedAction(registrationId: number) {
  await requireAdmin();
  const result = await db.transaction(async (tx) => {
    const reg = await tx.query.registrations.findFirst({ where: eq(registrations.id, registrationId) });
    if (!reg) return null;
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, reg.sessionId)).for("update");
    if (!session) return null;
    const now = new Date();
    const notify = session.endsAt > now && hasEmail(reg.email);
    const [row] = await tx
      .update(registrations)
      .set({
        status: "confirmed",
        waitlistedAt: null,
        updatedAt: now,
        // claim the send – exactly one e-mail, as with an automatic promotion
        ...(notify && { confirmationSentAt: now, lastEmailAt: now }),
      })
      .where(and(eq(registrations.id, registrationId), eq(registrations.status, "waitlisted")))
      .returning();
    if (!row) return null;
    await fitCapacity(tx, session.id, session.capacity);
    return { session, row, notify };
  });
  if (!result) return;
  if (result.notify) {
    try {
      await sendPromotedEmail(result.row, result.session);
    } catch (e) {
      console.error("Promotion e-mail could not be sent", e);
      await db.update(registrations).set({ confirmationSentAt: null }).where(eq(registrations.id, result.row.id));
    }
  }
  revalidateSession(result.session.id);
}

export type QuickRegisterResult = FormState & { message?: string };

/**
 * An organiser adds a player on the spot (only the nickname is needed). The player is confirmed ahead of
 * the waitlist; a full session gets one more spot. With an e-mail they get the usual confirmation.
 */
export async function adminQuickRegisterAction(
  sessionId: number,
  _prev: QuickRegisterResult,
  formData: FormData,
): Promise<QuickRegisterResult> {
  await requireAdmin();
  const { locale, t } = await getDict();
  const e = t.admin.errors;
  const parsed = quickRegistrationSchema(t.errors).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: e.checkForm, fieldErrors: fieldErrorsOf(parsed.error) };
  const { email, ...data } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).for("update");
    if (!session) return { kind: "not_found" as const };
    if (email) {
      const existing = await tx.query.registrations.findFirst({
        where: and(eq(registrations.sessionId, sessionId), eq(sql`lower(${registrations.email})`, email)),
      });
      if (existing) return { kind: "taken" as const, cancelled: existing.status === "cancelled" };
    }
    const now = new Date();
    const notify = email !== null && session.endsAt > now;
    const [registration] = await tx
      .insert(registrations)
      .values({
        ...data,
        note: data.note ?? null,
        sessionId,
        email: email ?? noEmailAddress(),
        status: "confirmed",
        locale,
        // claim the confirmation send – exactly one e-mail
        confirmationSentAt: notify ? now : null,
        lastEmailAt: notify ? now : null,
        editToken: generateEditToken(),
      })
      .returning();
    const capacity = await fitCapacity(tx, sessionId, session.capacity);
    return { kind: "created" as const, session, registration, capacity, notify };
  });

  if (result.kind === "not_found") return { error: e.noSession };
  if (result.kind === "taken") {
    return { error: e.checkForm, fieldErrors: { email: [result.cancelled ? e.quickEmailCancelled : e.quickEmailTaken] } };
  }
  let emailFailed = false;
  if (result.notify) {
    try {
      await sendConfirmationEmail(result.registration, result.session);
    } catch (err) {
      console.error("Confirmation e-mail could not be sent", err);
      emailFailed = true;
      await db
        .update(registrations)
        .set({ confirmationSentAt: null, lastEmailAt: null })
        .where(eq(registrations.id, result.registration.id));
    }
  }
  revalidateSession(sessionId);
  const s = t.admin.session;
  return {
    ok: true,
    message: [
      s.quickAdded(result.registration.nickname),
      result.capacity !== null && s.quickCapacityRaised(result.capacity),
      result.notify && (emailFailed ? s.quickEmailFailed : s.quickEmailSent),
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export type EditPlayerResult = FormState & { message?: string };

/**
 * An organiser edits a player's sign-up – also after the session, e.g. a nickname typed wrong on the spot or
 * the e-mail of a walk-in. Once the personal data was deleted, name and phone stay empty and a typed e-mail
 * is stored only as the player's pseudonym, so the stats can tell it is the same player. A new address of a
 * player of an upcoming session gets the confirmation; nothing else is e-mailed.
 */
export async function adminUpdateRegistrationAction(
  registrationId: number,
  _prev: EditPlayerResult,
  formData: FormData,
): Promise<EditPlayerResult> {
  await requireAdmin();
  const { t } = await getDict();
  const e = t.admin.errors;
  const current = await db.query.registrations.findFirst({
    where: eq(registrations.id, registrationId),
    with: { session: true },
  });
  // erased at the player's request: nothing personal may come back
  if (!current || isErased(current.email)) return { error: t.errors.regNotFound };
  const { session } = current;
  const parsed = adminRegistrationEditSchema(t.errors, session.arrivalMode).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: e.checkForm, fieldErrors: fieldErrorsOf(parsed.error) };
  const { email: typed, ...data } = parsed.data;
  const timeErrors = timeRangeErrors(data, session, t.errors);
  if (timeErrors) return { error: e.checkForm, fieldErrors: timeErrors };
  const deleted = isAnonymized(current.email);
  // an emptied e-mail becomes a stand-in, like a walk-in's; a walk-in left without one keeps theirs
  const wanted = deleted
    ? typed ? playerPseudonym(typed) : current.email
    : (typed ?? (hasEmail(current.email) ? noEmailAddress() : current.email));
  // the same address in other letter case is no new address
  const emailChanged = wanted !== current.email.toLowerCase();
  const email = emailChanged ? wanted : current.email;
  const now = new Date();
  const notify = emailChanged && hasEmail(email) && session.endsAt > now && current.status !== "cancelled";

  const result = await db.transaction(async (tx) => {
    // the lock keeps a quick sign-up or another edit from taking the same e-mail meanwhile
    await tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, session.id)).for("update");
    if (emailChanged) {
      const taken = await tx.query.registrations.findFirst({
        where: and(
          eq(registrations.sessionId, session.id),
          eq(sql`lower(${registrations.email})`, email),
          ne(registrations.id, current.id),
        ),
      });
      if (taken) return { kind: "taken" as const, cancelled: taken.status === "cancelled" };
    }
    const [row] = await tx
      .update(registrations)
      .set({
        nickname: data.nickname,
        email,
        ...(!deleted && { firstName: data.firstName ?? null, lastName: data.lastName ?? null, phone: data.phone }),
        arrivalTime: data.arrivalTime,
        departureTime: data.departureTime,
        arrivesLate: data.arrivesLate,
        canStorytell: data.canStorytell,
        isNewbie: data.isNewbie,
        note: data.note ?? null,
        // claim the confirmation to the new address – exactly one e-mail
        ...(notify && { confirmationSentAt: now, lastEmailAt: now }),
        updatedAt: now,
      })
      .where(eq(registrations.id, current.id))
      .returning();
    return { kind: "saved" as const, row };
  });

  if (result.kind === "taken") {
    return { error: e.checkForm, fieldErrors: { email: [result.cancelled ? e.quickEmailCancelled : e.quickEmailTaken] } };
  }
  let emailFailed = false;
  if (notify) {
    try {
      if (result.row.status === "waitlisted") await sendExistingRegistrationEmail(result.row, session);
      else await sendConfirmationEmail(result.row, session);
    } catch (err) {
      console.error("Confirmation e-mail could not be sent", err);
      emailFailed = true;
      await db.update(registrations).set({ confirmationSentAt: null, lastEmailAt: null }).where(eq(registrations.id, current.id));
    }
  }
  revalidateSession(session.id);
  // nicknames show in the archive's rosters
  revalidatePath("/botc/archiv");
  const s = t.admin.session;
  if (!notify) return { ok: true };
  return { ok: true, message: (emailFailed ? s.playerEmailFailed : s.playerEmailSent)(result.row.nickname) };
}

/** Marks attendance: true = came, false = no-show, null = not marked. */
export async function setAttendanceAction(registrationId: number, attended: boolean | null) {
  await requireAdmin();
  const [row] = await db
    .update(registrations)
    .set({ attended, updatedAt: new Date() })
    .where(eq(registrations.id, registrationId))
    .returning({ sessionId: registrations.sessionId });
  if (row) revalidatePath(`/admin/botc/termin/${row.sessionId}`);
}

/** E-mails a player the link to their registration again (also marks a failed confirmation as sent). */
export async function adminResendLinkAction(registrationId: number): Promise<SimpleResult> {
  await requireAdmin();
  const { t } = await getDict();
  const reg = await db.query.registrations.findFirst({
    where: eq(registrations.id, registrationId),
    with: { session: true },
  });
  if (!reg) return { message: t.admin.errors.noSession };
  try {
    await sendExistingRegistrationEmail(reg, reg.session);
  } catch (e) {
    console.error("Resend link failed", e);
    return { ok: false, message: t.admin.errors.linkFailed };
  }
  const now = new Date();
  await db
    .update(registrations)
    .set({ lastEmailAt: now, confirmationSentAt: reg.confirmationSentAt ?? now })
    .where(eq(registrations.id, registrationId));
  revalidatePath(`/admin/botc/termin/${reg.sessionId}`);
  return { ok: true, message: t.admin.errors.linkSent };
}

export type BroadcastResult = FormState & { sent?: number; failed?: number };

export async function broadcastEmailAction(
  sessionId: number,
  _prev: BroadcastResult,
  formData: FormData,
): Promise<BroadcastResult> {
  await requireAdmin();
  const { t } = await getDict();
  const parsed = broadcastSchema(t.admin.errors).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: t.admin.errors.checkForm, fieldErrors: fieldErrorsOf(parsed.error) };
  }
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) return { error: t.admin.errors.noSession };
  const statuses: ("confirmed" | "waitlisted")[] = parsed.data.includeWaitlist
    ? ["confirmed", "waitlisted"]
    : ["confirmed"];
  const recipients = await db.query.registrations.findMany({
    where: and(eq(registrations.sessionId, sessionId), inArray(registrations.status, statuses)),
  });
  let sent = 0;
  let failed = 0;
  for (const reg of recipients) {
    if (!hasEmail(reg.email)) continue;
    try {
      await sendBroadcastEmail(reg, session, parsed.data.subject, parsed.data.message);
      sent++;
    } catch (e) {
      console.error("Broadcast e-mail failed", e);
      failed++;
    }
  }
  if (sent > 0) {
    await db
      .update(registrations)
      .set({ lastEmailAt: new Date() })
      .where(and(eq(registrations.sessionId, sessionId), inArray(registrations.status, statuses)));
  }
  return { ok: true, sent, failed };
}

/** New secret link to the signed-in organiser's calendar feed; calendars subscribed to the old one stop updating. */
export async function rotateFeedKeyAction(): Promise<SimpleResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  await rotateFeedKey(me.id);
  revalidatePath("/admin/botc");
  return { ok: true, message: t.admin.list.orgCalendarRotated };
}

export async function addGameAction(sessionId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const { t } = await getDict();
  const parsed = gameSchema(t.admin.errors).safeParse(Object.fromEntries(formData.entries()));
  const roster = parseRoster(formData);
  const demonBluffs = parseBluffs(formData);
  if (!parsed.success || !roster || demonBluffs === undefined) {
    return { error: t.admin.errors.checkForm, fieldErrors: parsed.success ? undefined : fieldErrorsOf(parsed.error) };
  }
  await db.transaction(async (tx) => {
    const [game] = await tx.insert(games).values({ sessionId, ...parsed.data, demonBluffs }).returning({ id: games.id });
    await saveRoster(tx, game.id, sessionId, roster);
  });
  revalidatePath(`/admin/botc/termin/${sessionId}`);
  revalidatePath("/botc/archiv");
  return { ok: true };
}

export async function updateGameAction(gameId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const { t } = await getDict();
  const parsed = gameSchema(t.admin.errors).safeParse(Object.fromEntries(formData.entries()));
  const roster = parseRoster(formData);
  const demonBluffs = parseBluffs(formData);
  if (!parsed.success || !roster || demonBluffs === undefined) {
    return { error: t.admin.errors.checkForm, fieldErrors: parsed.success ? undefined : fieldErrorsOf(parsed.error) };
  }
  const row = await db.transaction(async (tx) => {
    const [game] = await tx
      .update(games)
      .set({ ...parsed.data, demonBluffs })
      .where(eq(games.id, gameId))
      .returning({ sessionId: games.sessionId });
    if (game) await saveRoster(tx, gameId, game.sessionId, roster);
    return game;
  });
  if (!row) return { error: t.admin.errors.noGame };
  revalidatePath(`/admin/botc/termin/${row.sessionId}`);
  revalidatePath("/botc/archiv");
  return { ok: true };
}

export async function deleteGameAction(gameId: number) {
  await requireAdmin();
  const [row] = await db.delete(games).where(eq(games.id, gameId)).returning({ sessionId: games.sessionId });
  if (row) {
    revalidatePath(`/admin/botc/termin/${row.sessionId}`);
    revalidatePath("/botc/archiv");
  }
}

export async function sendRemindersNowAction(sessionId: number): Promise<SimpleResult> {
  await requireAdmin();
  const { t } = await getDict();
  const r = await sendDueReminders({ sessionId, ignoreWindow: true });
  revalidatePath(`/admin/botc/termin/${sessionId}`);
  if (r.due === 0) return { ok: true, message: t.admin.errors.remindersAllSent };
  return { ok: r.failed === 0, message: t.admin.errors.remindersSent(r.sent, r.failed) };
}

export async function announceDiscordAction(sessionId: number): Promise<SimpleResult> {
  await requireAdmin();
  const { t } = await getDict();
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) return { message: t.admin.errors.noSession };
  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(registrations)
    .where(and(eq(registrations.sessionId, sessionId), eq(registrations.status, "confirmed")));
  const result = await announceSessionOnDiscord(session, Math.max(0, session.capacity - c));
  return {
    ok: result === "sent",
    message: {
      sent: t.admin.errors.discordSent,
      not_configured: t.admin.errors.discordNotConfigured,
      failed: t.admin.errors.discordFailed,
    }[result],
  };
}
