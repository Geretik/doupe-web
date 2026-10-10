import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, getTableColumns, gte, isNotNull, lt, lte, sql, type SQL } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { adminUsers, attendance, attendanceAffiliations, type AttendanceAffiliation, type AttendanceEntry } from "@/db/schema";
import { siteUrl } from "./site";
import { dateToPragueLocal } from "./time";

/*
 * The club's attendance sheet. A QR code on the table leads to /prezence, the same address every time: on a club
 * night (Tuesday and Thursday) it opens that night's sheet, on other days it says when the next one is. A phone may
 * remember who fills it in (a cookie, see rememberedPerson), so the next night one tap is enough.
 */

/** The address in the QR code on the table. */
export function attendanceUrl() {
  return `${siteUrl()}/prezence`;
}

/** Club nights by weekday, 0 = Sunday: Tuesday and Thursday. ATTENDANCE_WEEKDAYS ("1,3") changes them; the e2e tests open every day. */
export function clubWeekdays(): number[] {
  const env = process.env.ATTENDANCE_WEEKDAYS?.trim();
  if (!env) return [2, 4];
  return env.split(",").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

/** Until this hour of the morning an entry counts to the evening before: club nights may run past midnight. */
export const NIGHT_ENDS_AT_HOUR = 5;

/** The names are deleted this many years after the night; the privacy page and the admin say so. */
export const ATTENDANCE_RETENTION_YEARS = 2;

/** "YYYY-MM-DD" of the club night an entry made at `at` belongs to, in Prague time. */
export function attendanceDay(at = new Date()) {
  return dateToPragueLocal(new Date(at.getTime() - NIGHT_ENDS_AT_HOUR * 3600_000)).slice(0, 10);
}

/** Noon UTC of the day: the same calendar day in Prague, for formatting it. */
export function dayDate(day: string) {
  return new Date(`${day}T12:00:00Z`);
}

export function addDays(day: string, n: number) {
  const d = dayDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isClubDay(day: string) {
  return clubWeekdays().includes(dayDate(day).getUTCDay());
}

/** The night whose sheet is open now, or null on a day without a club night. */
export function openNight(at = new Date()) {
  const day = attendanceDay(at);
  return isClubDay(day) ? day : null;
}

/** The first club night after `day`, or null when no weekday is one. */
export function nextClubDay(day: string) {
  for (let i = 1; i <= 7; i++) {
    const next = addDays(day, i);
    if (isClubDay(next)) return next;
  }
  return null;
}

/** "YYYY-MM-DD" of an existing date (from an <input type="date"> or the address), else null. */
export function parseDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return dayDate(value).toISOString().slice(0, 10) === value ? value : null;
}

/** 1 September of the academic year `day` is in: where the organisers' overview starts. */
export function academicYearStart(day: string) {
  const [y, m] = day.split("-").map(Number);
  return `${m >= 9 ? y : y - 1}-09-01`;
}

export type Person = { firstName: string; lastName: string; affiliation: AttendanceAffiliation };
/** Who a phone remembers: the person and the random key that their entries from this phone carry. */
export type Remembered = Person & { key: string };

const COOKIE = "prezence";
/** Only the attendance page gets the cookie: its server actions post to it too. */
const COOKIE_PATH = "/prezence";
/** Browsers keep a cookie 400 days at most; every entry renews it. */
const COOKIE_MAX_AGE = 400 * 24 * 3600;

const rememberedSchema = z.object({
  k: z.string().min(16).max(64),
  f: z.string().min(1).max(100),
  l: z.string().min(1).max(100),
  a: z.enum(attendanceAffiliations),
});

/**
 * Who this phone remembers, from its cookie. The cookie holds the name and the key itself, so the site keeps nothing
 * about the person between nights but their entries; the page's scripts cannot read it.
 */
export async function rememberedPerson(): Promise<Remembered | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = rememberedSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return parsed.success ? { key: parsed.data.k, firstName: parsed.data.f, lastName: parsed.data.l, affiliation: parsed.data.a } : null;
  } catch {
    return null;
  }
}

/** Remembers the person on this phone, or renews the cookie; server actions only. */
export async function rememberPerson(p: Remembered) {
  const value = Buffer.from(JSON.stringify({ k: p.key, f: p.firstName, l: p.lastName, a: p.affiliation })).toString("base64url");
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function forgetPerson() {
  (await cookies()).set(COOKIE, "", { path: COOKIE_PATH, maxAge: 0 });
}

export function newDeviceKey() {
  return randomBytes(18).toString("base64url");
}

function keyHash(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/** The same first and last name, whatever the case. */
function sameName(p: Person): SQL {
  return and(sql`lower(${attendance.firstName}) = lower(${p.firstName})`, sql`lower(${attendance.lastName}) = lower(${p.lastName})`)!;
}

/** The entry that the phone holding `key` made on the night `day`. */
export function phoneEntry(day: string, key: string) {
  return db.query.attendance.findFirst({ where: and(eq(attendance.day, day), eq(attendance.deviceKeyHash, keyHash(key))) });
}

/** "recorded" = a new entry; "already" = the person was on the sheet of that night before; "corrected" = their entry was changed. */
export type RecordOutcome = { status: "recorded" | "already" | "corrected"; entry: AttendanceEntry };

/**
 * Puts `person` on the sheet of the night `day`; `key` = the key of the phone that remembers them. Nobody is on one
 * night twice: when the phone's entry or an entry with the same name is there, that one is the answer, and an entry
 * without a key gets this one, so the phone can correct it later.
 */
export async function recordAttendance(day: string, person: Person, key: string | null, addedBy: number | null = null): Promise<RecordOutcome> {
  const own = key ? await phoneEntry(day, key) : undefined;
  if (own) return { status: "already", entry: own };
  const named = await db.query.attendance.findFirst({ where: and(eq(attendance.day, day), sameName(person)) });
  if (named) {
    if (!key || named.deviceKeyHash) return { status: "already", entry: named };
    const [linked] = await db.update(attendance).set({ deviceKeyHash: keyHash(key) }).where(eq(attendance.id, named.id)).returning();
    return { status: "already", entry: linked ?? named };
  }
  const [entry] = await db
    .insert(attendance)
    .values({ day, ...person, deviceKeyHash: key ? keyHash(key) : null, addedBy })
    .onConflictDoNothing()
    .returning();
  if (entry) return { status: "recorded", entry };
  // only an entry with this key can be in the way: a second tap that came in at the same moment
  return { status: "already", entry: (await phoneEntry(day, key!))! };
}

/** Corrects the entry that this phone made on the night `day`, or makes one when there is none yet. */
export async function correctAttendance(day: string, person: Person, key: string): Promise<RecordOutcome> {
  const [entry] = await db
    .update(attendance)
    .set(person)
    .where(and(eq(attendance.day, day), eq(attendance.deviceKeyHash, keyHash(key))))
    .returning();
  return entry ? { status: "corrected", entry } : recordAttendance(day, person, key);
}

/** The entries of one night in the order they came, with who added them by hand. */
export function listNight(day: string) {
  return db
    .select({ ...getTableColumns(attendance), addedByNickname: adminUsers.nickname })
    .from(attendance)
    .leftJoin(adminUsers, eq(attendance.addedBy, adminUsers.id))
    .where(eq(attendance.day, day))
    .orderBy(asc(attendance.createdAt), asc(attendance.id));
}

export type NightEntry = Awaited<ReturnType<typeof listNight>>[number];

/** How many are on the sheet of the night `day`. */
export async function countNight(day: string) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(attendance).where(eq(attendance.day, day));
  return row?.n ?? 0;
}

/** All entries from `from` to `to` (both included), oldest first: the CSV export. */
export function listEntries(from: string, to: string) {
  return db
    .select({ ...getTableColumns(attendance), addedByNickname: adminUsers.nickname })
    .from(attendance)
    .leftJoin(adminUsers, eq(attendance.addedBy, adminUsers.id))
    .where(and(gte(attendance.day, from), lte(attendance.day, to)))
    .orderBy(asc(attendance.day), asc(attendance.createdAt), asc(attendance.id));
}

export type AffiliationCounts = Record<AttendanceAffiliation, number>;

const countWhere = (a: AttendanceAffiliation) => sql<number>`(count(*) filter (where ${attendance.affiliation} = ${a}))::int`;
/** One person = one first and last name; entries whose names were already deleted are not counted. */
const personKey = sql`lower(${attendance.firstName}) || ' ' || lower(${attendance.lastName})`;
const peopleWhere = (a: AttendanceAffiliation) =>
  sql<number>`(count(distinct case when ${attendance.affiliation} = ${a} then ${personKey} end))::int`;

function affiliationCounts(row: Record<string, unknown>, prefix = ""): AffiliationCounts {
  return Object.fromEntries(attendanceAffiliations.map((a) => [a, Number(row[`${prefix}${a}`] ?? 0)])) as AffiliationCounts;
}

/** The nights from `from` to `to` that anyone came to, newest first, with how many came of each affiliation. */
export async function listNights(from: string, to: string) {
  const rows = await db
    .select({
      day: attendance.day,
      total: sql<number>`count(*)::int`,
      up: countWhere("up"),
      none: countWhere("none"),
    })
    .from(attendance)
    .where(and(gte(attendance.day, from), lte(attendance.day, to)))
    .groupBy(attendance.day)
    .orderBy(desc(attendance.day));
  return rows.map((r) => ({ day: r.day, total: r.total, byAffiliation: affiliationCounts(r) }));
}

/** Numbers for a report: nights, entries and different people from `from` to `to`, each also by affiliation. */
export async function summarize(from: string, to: string) {
  const [row] = await db
    .select({
      nights: sql<number>`(count(distinct ${attendance.day}))::int`,
      visits: sql<number>`count(*)::int`,
      people: sql<number>`(count(distinct ${personKey}))::int`,
      v_up: countWhere("up"),
      v_none: countWhere("none"),
      p_up: peopleWhere("up"),
      p_none: peopleWhere("none"),
    })
    .from(attendance)
    .where(and(gte(attendance.day, from), lte(attendance.day, to)));
  return {
    nights: row?.nights ?? 0,
    visits: row?.visits ?? 0,
    people: row?.people ?? 0,
    visitsBy: affiliationCounts(row ?? {}, "v_"),
    peopleBy: affiliationCounts(row ?? {}, "p_"),
  };
}

/** Deletes one entry; returns it, or undefined when it was gone already. */
export async function deleteEntry(id: number) {
  const [row] = await db.delete(attendance).where(eq(attendance.id, id)).returning();
  return row;
}

/** Run by the daily cron: deletes the names of nights older than ATTENDANCE_RETENTION_YEARS; the counts stay. */
export async function anonymizeOldAttendance() {
  const cutoff = dayDate(attendanceDay());
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - ATTENDANCE_RETENTION_YEARS);
  const rows = await db
    .update(attendance)
    .set({ firstName: null, lastName: null, deviceKeyHash: null })
    .where(and(lt(attendance.day, cutoff.toISOString().slice(0, 10)), isNotNull(attendance.firstName)))
    .returning({ id: attendance.id });
  return { anonymized: rows.length };
}
