import { randomInt } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  adminUsers,
  draftEvents,
  draftPicks,
  draftPools,
  draftScripts,
  draftSessionMembers,
  draftSessionOptions,
  draftSessions,
  drafts,
  type AdminUser,
  type DraftEventType,
  type DraftModeId,
  type DraftRoleSource,
  type DraftSessionMember,
} from "@/db/schema";
import type { Locale } from "@/i18n/dictionaries";
import { afterPick, drafterCanPick, firstTurn, type Turn } from "./engine";
import { TURN_REMINDER_HOURS } from "./events";
import { draftModes, fits, type ModeConfig } from "./modes";
import { sortRoleIds } from "./roles";
import { drafters, isDraftManager, runtime, sessionAccess, startReview, type SessionAccess, type SessionRows } from "./state";

/*
 * Everything that changes a draft. Each change of a session runs in one transaction that first locks the
 * session's row (SELECT … FOR UPDATE): changes of one session queue up behind each other – two picks from two
 * tabs, a start and an invitation at once – while other sessions go on undisturbed. What may be done is checked
 * on the rows read under that lock, never on what the browser saw.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Query = typeof db | Tx;

export type DraftError =
  | "notFound"
  | "forbidden"
  | "notPreparing"
  | "notActive"
  | "notCompleted"
  /** the page showed an older pick number: somebody (or another tab) picked in the meantime */
  | "stale"
  | "notYourTurn"
  | "taken"
  | "doesNotFit"
  | "notReady"
  | "ownerFixed"
  /** the script was saved elsewhere since the page was opened */
  | "conflict"
  | "outsidePool"
  | "emptyScript";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: DraftError };

const fail = (error: DraftError) => ({ ok: false as const, error });

/** All rows of a session; `lock` takes the session's row lock (only inside a transaction). */
export async function loadSessionRows(q: Query, sessionId: number, lock = false): Promise<SessionRows | null> {
  const query = q.select().from(draftSessions).where(eq(draftSessions.id, sessionId));
  const [session] = lock ? await query.for("update") : await query;
  if (!session) return null;
  const [draft] = await q.select().from(drafts).where(eq(drafts.id, session.draftId));
  const memberRows = await q
    .select({ member: draftSessionMembers, nickname: adminUsers.nickname })
    .from(draftSessionMembers)
    .leftJoin(adminUsers, eq(adminUsers.id, draftSessionMembers.userId))
    .where(eq(draftSessionMembers.sessionId, sessionId))
    .orderBy(asc(draftSessionMembers.id));
  const options = await q
    .select()
    .from(draftSessionOptions)
    .where(eq(draftSessionOptions.sessionId, sessionId))
    .orderBy(asc(draftSessionOptions.position));
  const pools = await q.select().from(draftPools).where(eq(draftPools.sessionId, sessionId)).orderBy(asc(draftPools.id));
  const picks = await q.select().from(draftPicks).where(eq(draftPicks.sessionId, sessionId)).orderBy(asc(draftPicks.pickNumber));
  return {
    session,
    draft,
    // the account's nickname as it is now; the one saved with the invitation once the account is gone
    members: memberRows.map(({ member, nickname }) => ({ ...member, nickname: nickname ?? member.nickname })),
    options,
    pools,
    picks,
  };
}

/** Runs `fn` on the locked session for someone who may at least see it. */
async function inSession<T>(
  sessionId: number,
  user: AdminUser,
  fn: (tx: Tx, rows: SessionRows, access: SessionAccess) => Promise<Result<T>>,
): Promise<Result<T>> {
  return db.transaction(async (tx) => {
    const rows = await loadSessionRows(tx, sessionId, true);
    if (!rows) return fail("notFound");
    const access = sessionAccess(user, rows.draft, rows.members);
    if (!access.view) return fail("notFound");
    return fn(tx, rows, access);
  });
}

/** For changes of a session that is still being prepared, by its owner or organizers. */
function preparing<T>(sessionId: number, user: AdminUser, fn: (tx: Tx, rows: SessionRows) => Promise<Result<T>>) {
  return inSession<T>(sessionId, user, async (tx, rows, access) => {
    if (!access.manage) return fail("forbidden");
    if (rows.session.status !== "preparing") return fail("notPreparing");
    return fn(tx, rows);
  });
}

/** Queues a notification; it goes out after the transaction once due (lib/draft/events). */
async function addEvent(tx: Tx, sessionId: number, type: DraftEventType, memberId: number | null = null) {
  await tx.insert(draftEvents).values({ sessionId, type, memberId });
}

/**
 * A new turn: the reminder is due a day later and goes out only if the drafter has not picked by then
 * (lib/draft/events) – also at the end of a row, when the same drafter goes again.
 */
async function addTurnEvent(tx: Tx, sessionId: number, memberId: number, pickNumber: number, now: Date) {
  const dueAt = new Date(now.getTime() + TURN_REMINDER_HOURS * 3600_000);
  await tx.insert(draftEvents).values({ sessionId, type: "turn", memberId, pickNumber, dueAt });
}

/** Seats 0…N-1 for the drafters in their current order (newcomers last); none for the others. */
async function compactSeats(tx: Tx, sessionId: number) {
  const members = await tx.select().from(draftSessionMembers).where(eq(draftSessionMembers.sessionId, sessionId));
  const order = drafters(members);
  await setSeats(tx, members, order);
}

async function setSeats(tx: Tx, members: DraftSessionMember[], order: DraftSessionMember[]) {
  const seatOf = new Map(order.map((m, i) => [m.id, i]));
  for (const m of members) {
    const seat = seatOf.get(m.id) ?? null;
    if (m.seat !== seat) await tx.update(draftSessionMembers).set({ seat }).where(eq(draftSessionMembers.id, m.id));
  }
}

// ─── Drafts ──────────────────────────────────────────────────────────────────

/** A draft's settings: what is offered and how it is played. */
export type DraftInput = {
  name: string;
  note: string | null;
  roleSource: DraftRoleSource;
  bundles: string[][];
  mode: DraftModeId;
  config: ModeConfig;
};

/**
 * Any account may set up a draft. It becomes its owner – drafting and accepted – and invites the others; the
 * setup (drafts) and the run (draft_sessions) are created together, one to one.
 */
export async function createDraft(user: AdminUser, input: DraftInput, locale: Locale): Promise<{ draftId: number }> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [draft] = await tx
      .insert(drafts)
      .values({ name: input.name, note: input.note, roleSource: input.roleSource, bundles: input.bundles, ownerId: user.id })
      .returning();
    const [session] = await tx
      .insert(draftSessions)
      .values({ draftId: draft.id, name: input.name, mode: input.mode, modeConfig: input.config, createdBy: user.id })
      .returning();
    await tx.insert(draftSessionMembers).values({
      sessionId: session.id,
      userId: user.id,
      nickname: user.nickname,
      role: "owner",
      drafts: true,
      status: "accepted",
      seat: 0,
      locale,
      invitedBy: user.id,
      respondedAt: now,
    });
    return { draftId: draft.id };
  });
}

/** Changes the settings until the start; then what is offered is the draft's own copy and stays as it was. */
export async function updateDraft(user: AdminUser, sessionId: number, input: DraftInput): Promise<Result> {
  return preparing(sessionId, user, async (tx, rows) => {
    const now = new Date();
    await tx
      .update(drafts)
      .set({ name: input.name, note: input.note, roleSource: input.roleSource, bundles: input.bundles, updatedAt: now })
      .where(eq(drafts.id, rows.draft.id));
    await tx
      .update(draftSessions)
      .set({ name: input.name, mode: input.mode, modeConfig: input.config, updatedAt: now })
      .where(eq(draftSessions.id, sessionId));
    return { ok: true };
  });
}

/** Deletes the draft with its picks, pools and scripts – its owner or an administrator. */
export async function deleteDraft(user: AdminUser, draftId: number): Promise<Result> {
  const draft = await db.query.drafts.findFirst({ where: eq(drafts.id, draftId) });
  if (!draft) return fail("notFound");
  if (!isDraftManager(user, draft)) return fail("forbidden");
  await db.delete(drafts).where(eq(drafts.id, draftId));
  return { ok: true };
}

// ─── Preparing ───────────────────────────────────────────────────────────────

export type InviteInput = { userIds: number[]; role: "organizer" | "participant"; drafts: boolean };

/**
 * Invites accounts to this one session; each gets an e-mail. Somebody who declined can be invited again;
 * existing members are left as they are. Drafting newcomers join the end of the order.
 */
export async function inviteMembers(user: AdminUser, sessionId: number, input: InviteInput, locale: Locale): Promise<Result<{ invited: string[] }>> {
  return preparing(sessionId, user, async (tx, rows) => {
    const accounts = input.userIds.length
      ? await tx.select().from(adminUsers).where(inArray(adminUsers.id, input.userIds)).orderBy(asc(adminUsers.id))
      : [];
    const invited: string[] = [];
    const now = new Date();
    for (const account of accounts) {
      const existing = rows.members.find((m) => m.userId === account.id);
      if (existing && existing.status !== "declined") continue;
      const values = {
        nickname: account.nickname,
        role: input.role,
        drafts: input.drafts,
        status: "invited" as const,
        seat: null,
        locale,
        invitedBy: user.id,
        invitedAt: now,
        respondedAt: null,
      };
      let memberId: number;
      if (existing) {
        await tx.update(draftSessionMembers).set(values).where(eq(draftSessionMembers.id, existing.id));
        memberId = existing.id;
      } else {
        const [m] = await tx.insert(draftSessionMembers).values({ sessionId, userId: account.id, ...values }).returning();
        memberId = m.id;
      }
      await addEvent(tx, sessionId, "invited", memberId);
      invited.push(account.nickname);
    }
    await compactSeats(tx, sessionId);
    return { ok: true, invited };
  });
}

/** The invited account accepts or declines; an accepted one can still leave until the start (not the owner). */
export async function respondToInvite(user: AdminUser, sessionId: number, accept: boolean, locale: Locale): Promise<Result> {
  return inSession(sessionId, user, async (tx, rows, access) => {
    const me = access.member;
    if (!me) return fail("forbidden");
    if (rows.session.status !== "preparing") return fail("notPreparing");
    if (me.role === "owner") return fail("ownerFixed");
    await tx
      .update(draftSessionMembers)
      .set({ status: accept ? "accepted" : "declined", respondedAt: new Date(), locale })
      .where(eq(draftSessionMembers.id, me.id));
    await compactSeats(tx, sessionId);
    return { ok: true };
  });
}

export type MemberPatch = { role?: "organizer" | "participant"; drafts?: boolean };

export async function updateMember(user: AdminUser, sessionId: number, memberId: number, patch: MemberPatch): Promise<Result> {
  return preparing(sessionId, user, async (tx, rows) => {
    const target = rows.members.find((m) => m.id === memberId);
    if (!target) return fail("notFound");
    if (patch.role && target.role === "owner") return fail("ownerFixed");
    await tx.update(draftSessionMembers).set(patch).where(eq(draftSessionMembers.id, memberId));
    if (patch.drafts !== undefined) await compactSeats(tx, sessionId);
    return { ok: true };
  });
}

export async function removeMember(user: AdminUser, sessionId: number, memberId: number): Promise<Result> {
  return preparing(sessionId, user, async (tx, rows) => {
    const target = rows.members.find((m) => m.id === memberId);
    if (!target) return { ok: true };
    if (target.role === "owner") return fail("ownerFixed");
    await tx.delete(draftSessionMembers).where(eq(draftSessionMembers.id, memberId));
    await compactSeats(tx, sessionId);
    return { ok: true };
  });
}

/** Moves a drafter one place earlier (-1) or later (+1) in the order. */
export async function moveMember(user: AdminUser, sessionId: number, memberId: number, delta: -1 | 1): Promise<Result> {
  return preparing(sessionId, user, async (tx, rows) => {
    const order = drafters(rows.members);
    const i = order.findIndex((m) => m.id === memberId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return { ok: true };
    [order[i], order[j]] = [order[j], order[i]];
    await setSeats(tx, rows.members, order);
    return { ok: true };
  });
}

/** A random order of the drafters. */
export async function shuffleOrder(user: AdminUser, sessionId: number): Promise<Result> {
  return preparing(sessionId, user, async (tx, rows) => {
    const order = drafters(rows.members);
    for (let i = order.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    await setSeats(tx, rows.members, order);
    return { ok: true };
  });
}

/**
 * Starts the draft once everything is ready (lib/draft/state startReview, checked again here under the lock).
 * The session gets its own copy of what is offered and its pools, so later changes of the Draft cannot reach
 * it; from now on its members and their order are fixed.
 */
export async function startSession(user: AdminUser, sessionId: number): Promise<Result> {
  return preparing(sessionId, user, async (tx, rows) => {
    const review = startReview(rows);
    if (!review.ready) return fail("notReady");
    const order = drafters(rows.members);
    await setSeats(tx, rows.members, order);
    const optionRows = await tx
      .insert(draftSessionOptions)
      .values(review.offer.options.map((o, position) => ({ sessionId, position, roleIds: o.roleIds })))
      .returning();
    const mode = draftModes[rows.session.mode];
    const poolRows = await tx
      .insert(draftPools)
      .values(mode.createPools(rows.session.modeConfig, order.map((m) => m.id)).map((p) => ({ sessionId, ...p })))
      .returning();
    const pools = poolRows.map((p) => ({ id: p.id, memberId: p.memberId, target: p.target, count: 0 }));
    const available = optionRows.map((o) => ({ id: o.id, roleIds: o.roleIds }));
    const turn = firstTurn(order.length, (seat) => drafterCanPick(mode, order[seat].id, pools, available));
    if (!turn) return fail("notReady");
    const now = new Date();
    const first = order[turn.seat].id;
    await tx
      .update(draftSessions)
      .set({ status: "active", startedAt: now, updatedAt: now, pickNumber: 1, seat: turn.seat, direction: turn.direction, currentMemberId: first })
      .where(eq(draftSessions.id, sessionId));
    await addTurnEvent(tx, sessionId, first, 1, now);
    return { ok: true };
  });
}

// ─── Drafting ────────────────────────────────────────────────────────────────

export type PickResult = Result<{ roleIds: string[]; completed: boolean }>;

/**
 * One pick, all or nothing. Under the session's lock it checks again that the session runs, that the account
 * drafts in it and is on turn, that the page showed the current pick number (a second tab or a double click
 * cannot pick twice, not even at the end of a row where the same drafter goes again), that the option is
 * still free and fits the pool. Then it saves the pick and the next turn. The unique indexes of draft_picks
 * would stop a second pick even if all that were bypassed.
 */
export async function makePick(user: AdminUser, sessionId: number, optionId: number, expectedPick: number): Promise<PickResult> {
  return inSession(sessionId, user, async (tx, rows, access) => {
    const { session } = rows;
    if (session.status !== "active") return fail("notActive");
    const me = access.member;
    if (!me || !access.drafter) return fail("forbidden");
    if (session.pickNumber !== expectedPick) return fail("stale");
    if (session.currentMemberId !== me.id) return fail("notYourTurn");
    const rt = runtime(rows);
    const option = rt.available.find((o) => o.id === optionId);
    if (!option) return fail("taken");
    const mode = draftModes[session.mode];
    const pool = mode.poolOf(me.id, rt.pools);
    if (!pool || !fits(pool, option.roleIds.length)) return fail("doesNotFit");

    await tx.insert(draftPicks).values({
      sessionId,
      pickNumber: session.pickNumber,
      memberId: me.id,
      optionId: option.id,
      poolId: pool.id,
      roleIds: option.roleIds,
    });

    const pools = rt.pools.map((p) => (p.id === pool.id ? { ...p, count: p.count + option.roleIds.length } : p));
    const available = rt.available.filter((o) => o.id !== option.id);
    const turn: Turn = { seat: session.seat ?? 0, direction: session.direction === -1 ? -1 : 1 };
    const next = afterPick(mode, turn, rt.order.map((m) => m.id), pools, available);
    const now = new Date();
    const pickNumber = session.pickNumber + 1;
    if (next.kind === "completed") {
      await tx
        .update(draftSessions)
        .set({ status: "completed", completedAt: now, updatedAt: now, pickNumber, seat: null, currentMemberId: null })
        .where(eq(draftSessions.id, sessionId));
      await addEvent(tx, sessionId, "completed");
    } else {
      await tx
        .update(draftSessions)
        .set({ updatedAt: now, pickNumber, seat: next.turn.seat, direction: next.turn.direction, currentMemberId: next.memberId })
        .where(eq(draftSessions.id, sessionId));
      await addTurnEvent(tx, sessionId, next.memberId, pickNumber, now);
    }
    return { ok: true, roleIds: option.roleIds, completed: next.kind === "completed" };
  });
}

/** Ends a session being prepared or drafted; picks and pools stay to be seen. */
export async function cancelSession(user: AdminUser, sessionId: number): Promise<Result> {
  return inSession(sessionId, user, async (tx, rows, access) => {
    if (!access.cancel) return fail("forbidden");
    if (rows.session.status !== "preparing" && rows.session.status !== "active") return fail("notActive");
    const now = new Date();
    await tx
      .update(draftSessions)
      .set({ status: "cancelled", cancelledAt: now, updatedAt: now, seat: null, currentMemberId: null })
      .where(eq(draftSessions.id, sessionId));
    await addEvent(tx, sessionId, "cancelled");
    return { ok: true };
  });
}

// ─── Scripts from pools ──────────────────────────────────────────────────────

/**
 * Who may make a script from a pool of a finished session: a personal pool's drafter, and in shared mode
 * every drafter and organizer of the session.
 */
export function canScriptPool(rows: SessionRows, access: SessionAccess, poolMemberId: number | null) {
  if (rows.session.status !== "completed" || !access.member || access.member.status !== "accepted") return false;
  if (poolMemberId !== null) return poolMemberId === access.member.id;
  return access.drafter || access.manage;
}

/** A new script with all characters of the pool, to be trimmed in the script form. */
export async function createScript(user: AdminUser, sessionId: number, poolId: number): Promise<Result<{ scriptId: number }>> {
  const rows = await loadSessionRows(db, sessionId);
  if (!rows) return fail("notFound");
  const access = sessionAccess(user, rows.draft, rows.members);
  if (!access.view) return fail("notFound");
  if (rows.session.status !== "completed") return fail("notCompleted");
  const pool = runtime(rows).pools.find((p) => p.id === poolId);
  if (!pool) return fail("notFound");
  if (!canScriptPool(rows, access, pool.memberId)) return fail("forbidden");
  const owner = pool.memberId === null ? null : rows.members.find((m) => m.id === pool.memberId);
  const [script] = await db
    .insert(draftScripts)
    .values({
      sessionId,
      poolId,
      createdBy: user.id,
      name: [rows.draft.name, owner?.nickname].filter(Boolean).join(" – "),
      author: user.nickname,
      roleIds: sortRoleIds(pool.roleIds),
    })
    .returning();
  return { ok: true, scriptId: script.id };
}

export type ScriptInput = { name: string; author: string | null; roleIds: string[]; version: number };

/**
 * Saves a script; every character must come from the script's pool – checked here, whatever the form sent.
 * A save from a page that is older than the last save is refused rather than overwriting it.
 */
export async function saveScript(user: AdminUser, scriptId: number, input: ScriptInput): Promise<Result> {
  return db.transaction(async (tx) => {
    const [script] = await tx.select().from(draftScripts).where(eq(draftScripts.id, scriptId)).for("update");
    if (!script) return fail("notFound");
    if (script.createdBy !== user.id) return fail("forbidden");
    const rows = await loadSessionRows(tx, script.sessionId);
    if (!rows) return fail("notFound");
    const pool = runtime(rows).pools.find((p) => p.id === script.poolId);
    if (!pool) return fail("notFound");
    const allowed = new Set(pool.roleIds);
    const ids = [...new Set(input.roleIds)];
    if (ids.some((id) => !allowed.has(id))) return fail("outsidePool");
    if (ids.length === 0) return fail("emptyScript");
    if (script.version !== input.version) return fail("conflict");
    await tx
      .update(draftScripts)
      .set({ name: input.name, author: input.author, roleIds: sortRoleIds(ids), version: script.version + 1, updatedAt: new Date() })
      .where(and(eq(draftScripts.id, scriptId), eq(draftScripts.version, input.version)));
    return { ok: true };
  });
}

/** Its author deletes a script, or the Draft's owner or an administrator. */
export async function deleteScript(user: AdminUser, scriptId: number): Promise<Result<{ draftId: number }>> {
  const script = await db.query.draftScripts.findFirst({ where: eq(draftScripts.id, scriptId) });
  if (!script) return fail("notFound");
  const rows = await loadSessionRows(db, script.sessionId);
  if (!rows) return fail("notFound");
  if (script.createdBy !== user.id && !isDraftManager(user, rows.draft)) return fail("forbidden");
  await db.delete(draftScripts).where(eq(draftScripts.id, scriptId));
  return { ok: true, draftId: rows.draft.id };
}
