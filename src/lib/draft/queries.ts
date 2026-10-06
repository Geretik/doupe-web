import { and, asc, desc, eq, isNotNull, ne, or, sql } from "drizzle-orm";
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
  type Draft,
  type DraftInviteStatus,
  type DraftSession,
} from "@/db/schema";

/*
 * Reads for the draft pages. Who may see what is decided here and in lib/draft/state (sessionAccess):
 * a draft is shown to its members and to its owner and administrators – nobody else.
 * A draft is its setup (drafts) and its run (draft_sessions), one to one; the first run counts.
 */

const currentNickname = sql<string | null>`(select coalesce(u.nickname, m.nickname) from ${draftSessionMembers} m
  left join ${adminUsers} u on u.id = m.user_id where m.id = ${draftSessions.currentMemberId})`;

export type DraftListItem = {
  draft: Draft;
  session: DraftSession;
  owner: string | null;
  /** The account's membership; null for an administrator who is not in the draft */
  memberId: number | null;
  memberStatus: DraftInviteStatus | null;
  drafts: boolean | null;
  myTurn: boolean;
  current: string | null;
  /** The account's pool in personal mode, the shared pool in shared mode; all pools for others */
  poolCount: number;
  poolTarget: number;
};

/** Drafts the account is in (not those it declined) or owns; administrators see all. Those waiting for it first. */
export async function listDraftsFor(user: AdminUser): Promise<DraftListItem[]> {
  const mine = sql`(${draftSessionMembers.id} is null or pl.member_id = ${draftSessionMembers.id} or pl.member_id is null)`;
  const rows = await db
    .select({
      draft: drafts,
      session: draftSessions,
      owner: adminUsers.nickname,
      memberId: draftSessionMembers.id,
      memberStatus: draftSessionMembers.status,
      drafts: draftSessionMembers.drafts,
      current: currentNickname,
      poolCount: sql<number>`(select coalesce(sum(jsonb_array_length(p.role_ids)), 0)::int from ${draftPicks} p
        join ${draftPools} pl on pl.id = p.pool_id where pl.session_id = ${draftSessions.id} and ${mine})`,
      poolTarget: sql<number>`(select coalesce(sum(pl.target), 0)::int from ${draftPools} pl where pl.session_id = ${draftSessions.id} and ${mine})`,
    })
    .from(drafts)
    .innerJoin(
      draftSessions,
      and(eq(draftSessions.draftId, drafts.id), sql`${draftSessions.id} = (select min(s.id) from ${draftSessions} s where s.draft_id = ${drafts.id})`),
    )
    .leftJoin(adminUsers, eq(adminUsers.id, drafts.ownerId))
    .leftJoin(draftSessionMembers, and(eq(draftSessionMembers.sessionId, draftSessions.id), eq(draftSessionMembers.userId, user.id)))
    .where(
      user.role === "admin"
        ? undefined
        : or(eq(drafts.ownerId, user.id), and(isNotNull(draftSessionMembers.id), ne(draftSessionMembers.status, "declined"))),
    )
    .orderBy(desc(draftSessions.updatedAt));
  const rank = (r: DraftListItem) =>
    r.myTurn ? 0 : r.memberStatus === "invited" && r.session.status === "preparing" ? 1 : { active: 2, preparing: 3, completed: 4, cancelled: 5 }[r.session.status];
  return rows
    .map((r) => ({ ...r, myTurn: r.session.status === "active" && r.memberId !== null && r.session.currentMemberId === r.memberId }))
    .sort((a, b) => rank(a) - rank(b));
}

/** The run of a draft (its first one, should an old draft have more). */
export async function sessionIdOfDraft(draftId: number) {
  const [row] = await db
    .select({ id: draftSessions.id })
    .from(draftSessions)
    .where(eq(draftSessions.draftId, draftId))
    .orderBy(asc(draftSessions.id))
    .limit(1);
  return row?.id ?? null;
}

/** The draft of a run, for the addresses of single runs from before October 2026 (/admin/drafty/session/…). */
export async function draftIdOfSession(sessionId: number) {
  const [row] = await db.select({ draftId: draftSessions.draftId }).from(draftSessions).where(eq(draftSessions.id, sessionId));
  return row?.draftId ?? null;
}

/** For the admin menu: drafts where it is the account's turn, and invitations it has not answered. */
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

/** Accounts that can be invited to a draft (everybody who is not in it yet, or declined); nicknames only – organisers do not see each other's e-mails. */
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
