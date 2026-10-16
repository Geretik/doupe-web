import { and, asc, desc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import data from "@/data/game-collection.json";
import otherNames from "@/data/game-names.json";
import { db } from "@/db";
import { adminUsers, attendance, gameBarcodes, gameLending, gameLoans, type GameLoan } from "@/db/schema";
import type { PackedIn } from "./game-boxes";
import { guessGames } from "./game-match";
import { gameUpcNames } from "./gameupc";
import type { CollectionGame } from "./zatrolene";

/*
 * Lending the club's games (admin → Půjčovna). An organiser finds the game by the bar code on its box, read with the
 * phone's camera, or by its name, and writes who takes it; the name is suggested from the attendance sheet. Codes
 * are learned: the first scan of an unknown one asks which game it is, offering the games named as GameUPC names it.
 * A box without a code is marked so (found by its name only); games in one box are a bundle (lib/game-boxes).
 */

/** The borrower's name (and the note, which may name people too) is deleted this many days after the game came back. */
export const LOAN_RETENTION_DAYS = 365;

/** How many returned loans the page lists. */
export const RETURNED_SHOWN = 30;

/** The club's games: the copy of its collection on Zatrolené hry (`npm run hry`). */
export function collectionGames(): CollectionGame[] {
  return data.games as CollectionGame[];
}

export function findGame(id: number) {
  return collectionGames().find((g) => g.id === id) ?? null;
}

/** The game's other names on Zatrolené hry (the original title of a Czech edition…), read by `npm run hry`. */
export function otherGameNames(id: number): string[] {
  return (otherNames.names as Record<string, string[]>)[id] ?? [];
}

/**
 * Which game of the collection a code we don't know may be: the name GameUPC gives it (null when none) and the games
 * of that name, or a name much like it, the likeliest first.
 */
export async function guessGamesByCode(code: string): Promise<{ name: string | null; gameIds: number[] }> {
  const names = await gameUpcNames(code);
  const games = collectionGames().map((g) => ({ id: g.id, names: [g.name, ...otherGameNames(g.id)] }));
  return { name: names[0] ?? null, gameIds: guessGames(names, games) };
}

/** Every known code with its game. */
export function listBarcodes() {
  return db.select({ code: gameBarcodes.code, gameId: gameBarcodes.gameId }).from(gameBarcodes).orderBy(asc(gameBarcodes.createdAt));
}

/** The boxes marked as having no bar code, and which game's box each game packed in another lives in. */
export async function lendingSettings(): Promise<{ noBarcode: number[]; packedIn: PackedIn }> {
  const rows = await db.select({ gameId: gameLending.gameId, noBarcode: gameLending.noBarcode, packedIn: gameLending.packedIn }).from(gameLending);
  return {
    noBarcode: rows.filter((r) => r.noBarcode).map((r) => r.gameId),
    packedIn: Object.fromEntries(rows.flatMap((r) => (r.packedIn === null ? [] : [[r.gameId, r.packedIn]]))),
  };
}

/** The game whose box `gameId` lives in (itself unless packed in another): a box's marks are its game's. */
export async function boxOfGame(gameId: number) {
  const [row] = await db.select({ packedIn: gameLending.packedIn }).from(gameLending).where(eq(gameLending.gameId, gameId));
  return row?.packedIn ?? gameId;
}

/** The box of the game has no bar code (`value` false: it may have one after all). */
export async function setNoBarcode(gameId: number, value: boolean, by: number) {
  await db
    .insert(gameLending)
    .values({ gameId, noBarcode: value, updatedBy: by })
    .onConflictDoUpdate({ target: gameLending.gameId, set: { noBarcode: value, updatedBy: by, updatedAt: new Date() } });
}

/**
 * Puts `gameId` in the box of `box` (out of any other), or takes it out with null. Boxes don't nest: "nested" when
 * games are packed in `gameId`, "inside" when `box` is itself in the box of another game.
 */
export async function packGame(gameId: number, box: number | null, by: number): Promise<"ok" | "nested" | "inside"> {
  if (box !== null) {
    const [packed] = await db.select({ id: gameLending.gameId }).from(gameLending).where(eq(gameLending.packedIn, gameId)).limit(1);
    if (packed) return "nested";
    if ((await boxOfGame(box)) !== box) return "inside";
  }
  await db
    .insert(gameLending)
    .values({ gameId, packedIn: box, updatedBy: by })
    .onConflictDoUpdate({ target: gameLending.gameId, set: { packedIn: box, updatedBy: by, updatedAt: new Date() } });
  return "ok";
}

const lender = alias(adminUsers, "lender");

/** The games out now, the longest out first, with who lent them. */
export function listOpenLoans() {
  return db
    .select({ id: gameLoans.id, gameId: gameLoans.gameId, gameName: gameLoans.gameName, borrower: gameLoans.borrower, note: gameLoans.note, lentAt: gameLoans.lentAt, lentBy: lender.nickname })
    .from(gameLoans)
    .leftJoin(lender, eq(gameLoans.lentBy, lender.id))
    .where(isNull(gameLoans.returnedAt))
    .orderBy(asc(gameLoans.lentAt), asc(gameLoans.id));
}

/** The latest loans that came back, newest return first. */
export function listReturnedLoans(limit = RETURNED_SHOWN) {
  return db
    .select({ id: gameLoans.id, gameId: gameLoans.gameId, gameName: gameLoans.gameName, borrower: gameLoans.borrower, note: gameLoans.note, lentAt: gameLoans.lentAt, returnedAt: gameLoans.returnedAt })
    .from(gameLoans)
    .where(isNotNull(gameLoans.returnedAt))
    .orderBy(desc(gameLoans.returnedAt), desc(gameLoans.id))
    .limit(limit);
}

/** The last returned loan of every game that has one: who had it before, when a piece goes missing. */
export function lastReturnedLoans() {
  return db
    .selectDistinctOn([gameLoans.gameId], { gameId: gameLoans.gameId, borrower: gameLoans.borrower, lentAt: gameLoans.lentAt, returnedAt: gameLoans.returnedAt })
    .from(gameLoans)
    .where(isNotNull(gameLoans.returnedAt))
    .orderBy(gameLoans.gameId, desc(gameLoans.returnedAt));
}

export async function countOpenLoans() {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(gameLoans).where(isNull(gameLoans.returnedAt));
  return row?.n ?? 0;
}

/** Spaces as one, around nothing: how a borrower's name is kept and compared. */
export function cleanName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

/**
 * Names to suggest for a borrower: everyone on the attendance sheet (whose name is not deleted yet) and everyone who
 * borrowed a game, each once whatever the case, the latest visit or loan first.
 */
export async function knownPeople(): Promise<string[]> {
  const [visitors, borrowers] = await Promise.all([
    db
      .select({ first: attendance.firstName, last: attendance.lastName, at: sql<string>`max(${attendance.day})::text` })
      .from(attendance)
      .where(isNotNull(attendance.firstName))
      .groupBy(attendance.firstName, attendance.lastName),
    db
      .select({ name: gameLoans.borrower, at: sql<string>`(max(${gameLoans.lentAt}) at time zone 'Europe/Prague')::date::text` })
      .from(gameLoans)
      .where(isNotNull(gameLoans.borrower))
      .groupBy(gameLoans.borrower),
  ]);
  const people = new Map<string, { name: string; at: string }>();
  const add = (raw: string, at: string) => {
    const name = cleanName(raw);
    const key = name.toLocaleLowerCase("cs");
    const known = people.get(key);
    if (name && (!known || known.at < at)) people.set(key, { name, at });
  };
  for (const v of visitors) add(`${v.first} ${v.last ?? ""}`, v.at);
  for (const b of borrowers) add(b.name ?? "", b.at);
  return [...people.values()].sort((a, b) => b.at.localeCompare(a.at) || a.name.localeCompare(b.name, "cs")).map((p) => p.name);
}

/** "lent" = a new loan; "already" = the game is out already (`loan` is that one, unless it came back meanwhile). */
export type LendOutcome = { status: "lent"; loan: GameLoan } | { status: "already"; loan: GameLoan | undefined };

/** Lends `game` to `borrower`; a game is out to one person at a time (game_loans_open_idx). */
export async function lendGame(game: CollectionGame, borrower: string, note: string | null, by: number): Promise<LendOutcome> {
  const [loan] = await db.insert(gameLoans).values({ gameId: game.id, gameName: game.name, borrower, note, lentBy: by }).onConflictDoNothing().returning();
  if (loan) return { status: "lent", loan };
  return { status: "already", loan: await db.query.gameLoans.findFirst({ where: and(eq(gameLoans.gameId, game.id), isNull(gameLoans.returnedAt)) }) };
}

/** Marks a loan returned; undefined when it is gone or came back already. */
export async function returnLoan(id: number, by: number) {
  const [loan] = await db
    .update(gameLoans)
    .set({ returnedAt: new Date(), returnedBy: by })
    .where(and(eq(gameLoans.id, id), isNull(gameLoans.returnedAt)))
    .returning();
  return loan;
}

/** The code belongs to `gameId` from now on, also when it belonged to another game (the organiser chose this one). */
export async function assignBarcode(code: string, gameId: number, by: number) {
  await db
    .insert(gameBarcodes)
    .values({ code, gameId, addedBy: by })
    .onConflictDoUpdate({ target: gameBarcodes.code, set: { gameId, addedBy: by, createdAt: new Date() } });
}

/** Forgets a code (given to the wrong game); returns it, or undefined when it was gone. */
export async function removeBarcode(code: string) {
  const [row] = await db.delete(gameBarcodes).where(eq(gameBarcodes.code, code)).returning();
  return row;
}

/** Run by the daily cron: deletes the borrowers' names and notes of loans returned more than LOAN_RETENTION_DAYS ago. */
export async function anonymizeOldLoans() {
  const cutoff = new Date(Date.now() - LOAN_RETENTION_DAYS * 24 * 3600_000);
  const rows = await db
    .update(gameLoans)
    .set({ borrower: null, note: null })
    .where(and(lt(gameLoans.returnedAt, cutoff), isNotNull(gameLoans.borrower)))
    .returning({ id: gameLoans.id });
  return { anonymized: rows.length };
}
