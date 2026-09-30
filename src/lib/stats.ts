import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, registrations, sessions } from "@/db/schema";
import { isErased, playerPseudonym, shownEmail } from "./retention";

export type PastSessionStats = {
  id: number;
  title: string;
  startsAt: Date;
  capacity: number;
  confirmed: number;
  attended: number;
  noShow: number;
  marked: number;
  newbies: number;
};

export async function pastSessionStats(): Promise<PastSessionStats[]> {
  const rows = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      startsAt: sessions.startsAt,
      capacity: sessions.capacity,
      confirmed: sql<number>`count(*) filter (where ${registrations.status} = 'confirmed')::int`,
      attended: sql<number>`count(*) filter (where ${registrations.status} = 'confirmed' and ${registrations.attended} is true)::int`,
      noShow: sql<number>`count(*) filter (where ${registrations.status} = 'confirmed' and ${registrations.attended} is false)::int`,
      marked: sql<number>`count(*) filter (where ${registrations.status} = 'confirmed' and ${registrations.attended} is not null)::int`,
      newbies: sql<number>`count(*) filter (where ${registrations.status} = 'confirmed' and ${registrations.isNewbie})::int`,
    })
    .from(sessions)
    .leftJoin(registrations, eq(registrations.sessionId, sessions.id))
    .where(lt(sessions.endsAt, new Date()))
    .groupBy(sessions.id)
    .orderBy(desc(sessions.startsAt));
  return rows;
}

export type Regular = {
  /** Same for all of a player's sign-ups, before and after their e-mail is deleted */
  key: string;
  /** null once the e-mail was deleted (RETENTION_DAYS after the session) */
  email: string | null;
  nickname: string;
  sessions: number;
  attended: number;
  noShow: number;
  lastAt: Date;
};

/** Confirmed sign-ups for past sessions, newest first; sign-ups erased on request are left out. */
async function pastSignUps() {
  const rows = await db
    .select({
      email: registrations.email,
      nickname: registrations.nickname,
      attended: registrations.attended,
      startsAt: sessions.startsAt,
    })
    .from(registrations)
    .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
    .where(and(eq(registrations.status, "confirmed"), lt(sessions.endsAt, new Date())))
    .orderBy(desc(sessions.startsAt));
  return rows.filter((r) => !isErased(r.email));
}

/**
 * Players by number of past sessions they were signed up for (confirmed). Grouped in code by the
 * e-mail's pseudonym, so a player whose older sign-ups are already anonymised stays one row.
 */
export async function regulars(limit = 20): Promise<Regular[]> {
  const byPlayer = new Map<string, Regular>();
  for (const r of await pastSignUps()) {
    const key = playerPseudonym(r.email);
    let p = byPlayer.get(key);
    if (!p) {
      // newest first: the first row has the player's current nickname
      p = { key, email: null, nickname: r.nickname, sessions: 0, attended: 0, noShow: 0, lastAt: r.startsAt };
      byPlayer.set(key, p);
    }
    p.email ??= shownEmail(r.email);
    p.sessions++;
    if (r.attended === true) p.attended++;
    if (r.attended === false) p.noShow++;
  }
  return [...byPlayer.values()]
    .sort((a, b) => b.sessions - a.sessions || b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, limit);
}

export type GameStats = {
  total: number;
  good: number;
  evil: number;
  scripts: { name: string; played: number; good: number; evil: number }[];
};

export async function gameStats(): Promise<GameStats> {
  const [tot] = await db
    .select({
      total: sql<number>`count(*)::int`,
      good: sql<number>`count(*) filter (where ${games.winner} = 'good')::int`,
      evil: sql<number>`count(*) filter (where ${games.winner} = 'evil')::int`,
    })
    .from(games);
  const scripts = await db
    .select({
      name: games.scriptName,
      played: sql<number>`count(*)::int`,
      good: sql<number>`count(*) filter (where ${games.winner} = 'good')::int`,
      evil: sql<number>`count(*) filter (where ${games.winner} = 'evil')::int`,
    })
    .from(games)
    .groupBy(games.scriptName)
    .orderBy(desc(sql`count(*)`), games.scriptName)
    .limit(15);
  return { ...tot, scripts };
}

export type Totals = {
  pastSessions: number;
  upcomingSessions: number;
  registrations: number;
  uniquePlayers: number;
  avgOccupancy: number | null;
  attendanceRate: number | null;
};

export async function totals(): Promise<Totals> {
  const now = new Date();
  const [s] = await db
    .select({
      past: sql<number>`count(*) filter (where ${sessions.endsAt} < ${now})::int`,
      upcoming: sql<number>`count(*) filter (where ${sessions.endsAt} >= ${now})::int`,
    })
    .from(sessions);
  const [r] = await db
    .select({
      registrations: sql<number>`count(*)::int`,
      attended: sql<number>`count(*) filter (where ${registrations.attended} is true)::int`,
      marked: sql<number>`count(*) filter (where ${registrations.attended} is not null)::int`,
    })
    .from(registrations)
    .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
    .where(and(eq(registrations.status, "confirmed"), lt(sessions.endsAt, now)));
  const [o] = await db
    .select({
      avg: sql<number | null>`avg(least(1.0, (
        select count(*)::numeric from ${registrations} x
        where x.session_id = ${sessions}.id and x.status = 'confirmed'
      ) / ${sessions.capacity}))`,
    })
    .from(sessions)
    .where(lt(sessions.endsAt, now));
  return {
    pastSessions: s.past,
    upcomingSessions: s.upcoming,
    registrations: r.registrations,
    uniquePlayers: new Set((await pastSignUps()).map((x) => playerPseudonym(x.email))).size,
    avgOccupancy: o.avg === null ? null : Number(o.avg),
    attendanceRate: r.marked ? r.attended / r.marked : null,
  };
}
