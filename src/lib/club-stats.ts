import { and, asc, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendance, gameLoans } from "@/db/schema";
import { dayDate, NIGHT_ENDS_AT_HOUR } from "./attendance";
import { dateToPragueLocal, pragueDaysBetween } from "./time";

/*
 * The club's numbers for admin → Statistiky klubu: who comes to the club nights (the attendance sheet) and which
 * games are borrowed, for a period. The rows of a period are few (tens of people a night), so they are counted here.
 */

/** The step of the arrivals chart, in minutes */
export const ARRIVAL_STEP = 30;

/** How often one person came in the period: the bins of the chart, by the least number of nights */
export const VISIT_BINS = [1, 2, 4, 10] as const;

/** How many of the most borrowed games are shown */
export const TOP_GAMES = 10;

/** One person = one first and last name; entries whose names were already deleted are not counted. */
const personKey = sql<string | null>`lower(${attendance.firstName}) || ' ' || lower(${attendance.lastName})`;

/** Minutes after the midnight before the club night: one past midnight counts after the evening (24 * 60 + …) */
function nightMinute(at: Date) {
  const [h, m] = dateToPragueLocal(at).slice(11).split(":").map(Number);
  return (h < NIGHT_ENDS_AT_HOUR ? h + 24 : h) * 60 + m;
}

/**
 * What the attendance sheet says of the nights from `from` to `to` beyond the counts of lib/attendance `summarize`:
 * the people who came for the first time ever, the busiest night, the average night by weekday, how often people
 * came, and when they came (entries from their own phones only: one added by hand was written later).
 */
export async function attendanceStats(from: string, to: string) {
  const range = and(gte(attendance.day, from), lte(attendance.day, to));
  const [rows, [first]] = await Promise.all([
    db
      .select({ day: attendance.day, person: personKey, byHand: isNotNull(attendance.addedBy), at: attendance.createdAt })
      .from(attendance)
      .where(range),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(
        db
          .select({ first: sql<string>`min(${attendance.day})`.as("first") })
          .from(attendance)
          .where(isNotNull(attendance.firstName))
          .groupBy(personKey)
          .as("people"),
      )
      .where(sql`"first" between ${from} and ${to}`),
  ]);

  const perNight = new Map<string, number>();
  const perPerson = new Map<string, number>();
  const arrivals = new Map<number, number>();
  for (const r of rows) {
    perNight.set(r.day, (perNight.get(r.day) ?? 0) + 1);
    if (r.person) perPerson.set(r.person, (perPerson.get(r.person) ?? 0) + 1);
    if (!r.byHand) {
      const slot = Math.floor(nightMinute(r.at) / ARRIVAL_STEP) * ARRIVAL_STEP;
      arrivals.set(slot, (arrivals.get(slot) ?? 0) + 1);
    }
  }

  let busiest: { day: string; people: number } | null = null;
  const weekdays = new Map<number, { nights: number; people: number }>();
  for (const [day, people] of [...perNight].sort(([a], [b]) => a.localeCompare(b))) {
    if (!busiest || people > busiest.people) busiest = { day, people };
    const w = dayDate(day).getUTCDay();
    const sum = weekdays.get(w) ?? { nights: 0, people: 0 };
    weekdays.set(w, { nights: sum.nights + 1, people: sum.people + people });
  }

  // the half hours from the first arrival to the last, the empty ones between too
  const slots = [...arrivals.keys()];
  const arrivalSlots = slots.length
    ? Array.from({ length: (Math.max(...slots) - Math.min(...slots)) / ARRIVAL_STEP + 1 }, (_, i) => {
        const minute = Math.min(...slots) + i * ARRIVAL_STEP;
        return { minute, people: arrivals.get(minute) ?? 0 };
      })
    : [];

  return {
    newcomers: first?.n ?? 0,
    busiest,
    /** Monday first, as the club's week goes */
    weekdays: [...weekdays]
      .sort(([a], [b]) => ((a + 6) % 7) - ((b + 6) % 7))
      .map(([weekday, s]) => ({ weekday, nights: s.nights, average: s.people / s.nights })),
    visitBins: VISIT_BINS.map((least, i) => {
      const next = VISIT_BINS[i + 1];
      return { least, most: next === undefined ? null : next - 1, people: [...perPerson.values()].filter((n) => n >= least && (next === undefined || n < next)).length };
    }),
    arrivals: arrivalSlots,
  };
}

/** "YYYY-MM" from `from` to `to`, both included */
function monthsBetween(from: string, to: string) {
  const months: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const last = to.slice(0, 7);
  for (let month = `${y}-${String(m).padStart(2, "0")}`; month <= last; month = `${y}-${String(m).padStart(2, "0")}`) {
    months.push(month);
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
  }
  return months;
}

/**
 * The loans of the games lent from `from` to `to` (Prague days): how many, of how many games, how long a game was out
 * (the ones back), the most borrowed games and the loans by month; and what is out now.
 */
export async function loanStats(from: string, to: string) {
  const lentDay = sql<string>`((${gameLoans.lentAt} at time zone 'Europe/Prague')::date)::text`;
  const [rows, open] = await Promise.all([
    db
      .select({ gameId: gameLoans.gameId, gameName: gameLoans.gameName, day: lentDay, lentAt: gameLoans.lentAt, returnedAt: gameLoans.returnedAt })
      .from(gameLoans)
      .where(sql`${lentDay} between ${from} and ${to}`)
      .orderBy(asc(gameLoans.lentAt)),
    db.select({ gameName: gameLoans.gameName, lentAt: gameLoans.lentAt }).from(gameLoans).where(isNull(gameLoans.returnedAt)).orderBy(asc(gameLoans.lentAt)),
  ]);

  const games = new Map<number, { name: string; loans: number }>();
  for (const r of rows) games.set(r.gameId, { name: r.gameName, loans: (games.get(r.gameId)?.loans ?? 0) + 1 });
  const back = rows.filter((r) => r.returnedAt !== null);
  const perMonth = new Map<string, number>();
  for (const r of rows) perMonth.set(r.day.slice(0, 7), (perMonth.get(r.day.slice(0, 7)) ?? 0) + 1);
  const now = new Date();

  return {
    loans: rows.length,
    games: games.size,
    /** Days out on average, of the loans back; null when none is */
    averageDays: back.length ? back.reduce((sum, r) => sum + pragueDaysBetween(r.lentAt, r.returnedAt!), 0) / back.length : null,
    top: [...games.values()].sort((a, b) => b.loans - a.loans || a.name.localeCompare(b.name, "cs")).slice(0, TOP_GAMES),
    /** From the month of the first loan of the period: a period from 2000 is not two hundred empty months */
    months: rows.length ? monthsBetween(rows[0].day, to).map((month) => ({ month, loans: perMonth.get(month) ?? 0 })) : [],
    openNow: open.length,
    longestOut: open[0] ? { game: open[0].gameName, days: pragueDaysBetween(open[0].lentAt, now) } : null,
  };
}
