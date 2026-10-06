import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adminUsers,
  draftPicks,
  draftPools,
  draftScripts,
  draftSessionMembers,
  draftSessions,
  drafts,
  type AdminUser,
  type DraftSession,
} from "@/db/schema";

/*
 * Reads for the draft pages. Who may see what is decided here and in lib/draft/state (sessionAccess):
 * a session is shown to its members and to its Draft's owner and administrators – nobody else.
 */

/** Drafts the account owns or plays a session of; administrators see all. */
export async function listDraftsFor(user: AdminUser) {
  const mine = sql`exists (select 1 from ${draftSessions} s join ${draftSessionMembers} m on m.session_id = s.id
    where s.draft_id = ${drafts.id} and m.user_id = ${user.id} and m.status <> 'declined')`;
  return db
    .select({
      draft: drafts,
      owner: adminUsers.nickname,
      sessions: sql<number>`(select count(*)::int from ${draftSessions} s where s.draft_id = ${drafts.id})`,
      active: sql<number>`(select count(*)::int from ${draftSessions} s where s.draft_id = ${drafts.id} and s.status = 'active')`,
    })
    .from(drafts)
    .leftJoin(adminUsers, eq(adminUsers.id, drafts.ownerId))
    .where(user.role === "admin" ? undefined : or(eq(drafts.ownerId, user.id), mine))
    .orderBy(desc(drafts.createdAt));
}

export async function getDraft(id: number) {
  const [row] = await db
    .select({ draft: drafts, owner: adminUsers.nickname })
    .from(drafts)
    .leftJoin(adminUsers, eq(adminUsers.id, drafts.ownerId))
    .where(eq(drafts.id, id));
  return row ?? null;
}

/** Characters picked per session, and the pools' total size. */
const draftedCount = sql<number>`(select coalesce(sum(jsonb_array_length(p.role_ids)), 0)::int from ${draftPicks} p where p.session_id = ${draftSessions.id})`;
const targetCount = sql<number>`(select coalesce(sum(pl.target), 0)::int from ${draftPools} pl where pl.session_id = ${draftSessions.id})`;
const currentNickname = sql<string | null>`(select coalesce(u.nickname, m.nickname) from ${draftSessionMembers} m
  left join ${adminUsers} u on u.id = m.user_id where m.id = ${draftSessions.currentMemberId})`;

export type SessionListItem = {
  session: DraftSession;
  drafters: number;
  members: number;
  drafted: number;
  target: number;
  current: string | null;
};

/** Sessions of a Draft; `onlyFor` = just those the account is a member of. */
export async function listSessionsOfDraft(draftId: number, onlyFor?: number): Promise<SessionListItem[]> {
  const memberOf = onlyFor
    ? sql`exists (select 1 from ${draftSessionMembers} m where m.session_id = ${draftSessions.id} and m.user_id = ${onlyFor} and m.status <> 'declined')`
    : undefined;
  return db
    .select({
      session: draftSessions,
      drafters: sql<number>`(select count(*)::int from ${draftSessionMembers} m where m.session_id = ${draftSessions.id} and m.drafts and m.status <> 'declined')`,
      members: sql<number>`(select count(*)::int from ${draftSessionMembers} m where m.session_id = ${draftSessions.id} and m.status <> 'declined')`,
      drafted: draftedCount,
      target: targetCount,
      current: currentNickname,
    })
    .from(draftSessions)
    .where(and(eq(draftSessions.draftId, draftId), memberOf))
    .orderBy(asc(draftSessions.id));
}

export type MySessionItem = {
  session: DraftSession;
  draftName: string;
  memberId: number;
  memberStatus: "invited" | "accepted" | "declined";
  drafts: boolean;
  myTurn: boolean;
  current: string | null;
  /** The account's pool in personal mode, the shared pool in shared mode */
  poolCount: number;
  poolTarget: number;
};

/** Sessions the account is in (not those it declined): the ones waiting for it first. */
export async function listMySessions(userId: number): Promise<MySessionItem[]> {
  const rows = await db
    .select({
      session: draftSessions,
      draftName: drafts.name,
      memberId: draftSessionMembers.id,
      memberStatus: draftSessionMembers.status,
      drafts: draftSessionMembers.drafts,
      current: currentNickname,
      poolCount: sql<number>`(select coalesce(sum(jsonb_array_length(p.role_ids)), 0)::int from ${draftPicks} p join ${draftPools} pl on pl.id = p.pool_id
        where pl.session_id = ${draftSessions.id} and (pl.member_id = ${draftSessionMembers.id} or pl.member_id is null))`,
      poolTarget: sql<number>`(select coalesce(sum(pl.target), 0)::int from ${draftPools} pl
        where pl.session_id = ${draftSessions.id} and (pl.member_id = ${draftSessionMembers.id} or pl.member_id is null))`,
    })
    .from(draftSessionMembers)
    .innerJoin(draftSessions, eq(draftSessions.id, draftSessionMembers.sessionId))
    .innerJoin(drafts, eq(drafts.id, draftSessions.draftId))
    .where(and(eq(draftSessionMembers.userId, userId), ne(draftSessionMembers.status, "declined")))
    .orderBy(desc(draftSessions.updatedAt));
  const rank = (r: MySessionItem) =>
    r.myTurn ? 0 : r.memberStatus === "invited" && r.session.status === "preparing" ? 1 : { active: 2, preparing: 3, completed: 4, cancelled: 5 }[r.session.status];
  return rows
    .map((r) => ({ ...r, myTurn: r.session.status === "active" && r.session.currentMemberId === r.memberId }))
    .sort((a, b) => rank(a) - rank(b));
}

/** For the admin menu: sessions where it is the account's turn, and invitations it has not answered. */
export async function countDraftAttention(userId: number) {
  const [row] = await db
    .select({
      turns: sql<number>`count(*) filter (where ${draftSessions.status} = 'active' and ${draftSessions.currentMemberId} = ${draftSessionMembers.id})::int`,
      invites: sql<number>`count(*) filter (where ${draftSessions.status} = 'preparing' and ${draftSessionMembers.status} = 'invited')::int`,
    })
    .from(draftSessionMembers)
    .innerJoin(draftSessions, eq(draftSessions.id, draftSessionMembers.sessionId))
    .where(eq(draftSessionMembers.userId, userId));
  return row ?? { turns: 0, invites: 0 };
}

/** Accounts that can be invited to a session (everybody who is not in it yet, or declined); nicknames only – organisers do not see each other's e-mails. */
export async function listInvitableAccounts(sessionId: number) {
  const inSession = db
    .select({ id: draftSessionMembers.userId })
    .from(draftSessionMembers)
    .where(and(eq(draftSessionMembers.sessionId, sessionId), ne(draftSessionMembers.status, "declined")));
  const taken = new Set((await inSession).map((r) => r.id));
  const all = await db.select({ id: adminUsers.id, nickname: adminUsers.nickname }).from(adminUsers).orderBy(asc(adminUsers.nickname));
  return all.filter((a) => !taken.has(a.id));
}

export async function listScriptsOfSession(sessionId: number) {
  return db
    .select({ script: draftScripts, creator: adminUsers.nickname })
    .from(draftScripts)
    .leftJoin(adminUsers, eq(adminUsers.id, draftScripts.createdBy))
    .where(eq(draftScripts.sessionId, sessionId))
    .orderBy(asc(draftScripts.id));
}

export async function getScript(id: number) {
  return (await db.query.draftScripts.findFirst({ where: eq(draftScripts.id, id) })) ?? null;
}
