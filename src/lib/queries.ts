import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, registrations, sessions } from "@/db/schema";

export type SessionWithCount = typeof sessions.$inferSelect & {
  confirmedCount: number;
  waitlistedCount: number;
  storytellerCount: number;
};

const confirmedCount = sql<number>`(
  select count(*)::int from ${registrations} r
  where r.session_id = ${sessions}.id and r.status = 'confirmed'
)`.as("confirmed_count");

const waitlistedCount = sql<number>`(
  select count(*)::int from ${registrations} r
  where r.session_id = ${sessions}.id and r.status = 'waitlisted'
)`.as("waitlisted_count");

const storytellerCount = sql<number>`(
  select count(*)::int from ${registrations} r
  where r.session_id = ${sessions}.id and r.status = 'confirmed' and r.can_storytell
)`.as("storyteller_count");

const sessionColumns = {
  id: sessions.id,
  title: sessions.title,
  city: sessions.city,
  startsAt: sessions.startsAt,
  endsAt: sessions.endsAt,
  place: sessions.place,
  capacity: sessions.capacity,
  storyteller: sessions.storyteller,
  spotsPostedAt: sessions.spotsPostedAt,
  note: sessions.note,
  arrivalMode: sessions.arrivalMode,
  phoneRequired: sessions.phoneRequired,
  scripts: sessions.scripts,
  createdAt: sessions.createdAt,
  confirmedCount,
  waitlistedCount,
  storytellerCount,
};

/** Upcoming sessions. */
export async function listUpcomingSessions(): Promise<SessionWithCount[]> {
  return db
    .select(sessionColumns)
    .from(sessions)
    .where(gte(sessions.endsAt, new Date()))
    .orderBy(asc(sessions.startsAt));
}

/** Past sessions, newest first. */
export async function listPastSessions(): Promise<SessionWithCount[]> {
  return db
    .select(sessionColumns)
    .from(sessions)
    .where(lt(sessions.endsAt, new Date()))
    .orderBy(desc(sessions.startsAt));
}

export async function listAllSessions(): Promise<SessionWithCount[]> {
  return db.select(sessionColumns).from(sessions).orderBy(asc(sessions.startsAt));
}

export async function getSessionWithCount(
  id: number,
): Promise<SessionWithCount | null> {
  const rows = await db
    .select(sessionColumns)
    .from(sessions)
    .where(eq(sessions.id, id));
  return rows[0] ?? null;
}

export async function getRegistrationByToken(token: string) {
  return db.query.registrations.findFirst({
    where: eq(registrations.editToken, token),
    with: { session: true },
  });
}

export async function listRegistrationsForSession(sessionId: number) {
  return db.query.registrations.findMany({
    where: and(eq(registrations.sessionId, sessionId)),
    orderBy: [asc(registrations.createdAt)],
  });
}

export type PublicPlayer = { nickname: string; canStorytell: boolean };

/** Nicknames of players, shown publicly on the session page. */
export async function listPublicPlayers(
  sessionId: number,
  status: "confirmed" | "waitlisted",
): Promise<PublicPlayer[]> {
  return db
    .select({ nickname: registrations.nickname, canStorytell: registrations.canStorytell })
    .from(registrations)
    .where(and(eq(registrations.sessionId, sessionId), eq(registrations.status, status)))
    .orderBy(
      status === "waitlisted" ? asc(registrations.waitlistedAt) : asc(registrations.createdAt),
    );
}

export async function listGamesForSession(sessionId: number) {
  return db.query.games.findMany({ where: eq(games.sessionId, sessionId), orderBy: [asc(games.createdAt)] });
}

/** Games of many sessions at once, keyed by session id (archive). */
export async function gamesBySession(sessionIds: number[]) {
  if (sessionIds.length === 0) return new Map<number, (typeof games.$inferSelect)[]>();
  const rows = await db.query.games.findMany({
    where: inArray(games.sessionId, sessionIds),
    orderBy: [asc(games.createdAt)],
  });
  const map = new Map<number, typeof rows>();
  for (const g of rows) map.set(g.sessionId, [...(map.get(g.sessionId) ?? []), g]);
  return map;
}

/** All registrations of one player (by e-mail), newest session first, with the session. */
export async function listRegistrationsByEmail(email: string) {
  return db.query.registrations.findMany({
    where: eq(sql`lower(${registrations.email})`, email.toLowerCase()),
    with: { session: true },
    orderBy: [desc(registrations.createdAt)],
  });
}

/** 1-based position of a waitlisted registration in the queue. */
export async function waitlistPosition(reg: {
  sessionId: number;
  waitlistedAt: Date | null;
}) {
  if (!reg.waitlistedAt) return 1;
  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(registrations)
    .where(
      and(
        eq(registrations.sessionId, reg.sessionId),
        eq(registrations.status, "waitlisted"),
        sql`${registrations.waitlistedAt} < ${reg.waitlistedAt}`,
      ),
    );
  return c + 1;
}
