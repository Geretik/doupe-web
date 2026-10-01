import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { gameCollection } from "@/db/schema";
import { notifyOrganizers } from "./alerts";
import { clubCollectionUrl, fetchClubCollection, PageChangedError } from "./zatrolene";

const ID = "zatrolene-hry";

/** How old the list may get before a visit reads it again: edits on Zatrolené hry show up within this time. */
export const FRESH_MINUTES = 60;
/** After a failed read, the next visit tries again this much later. */
const RETRY_MINUTES = 15;

export type GameCollection = typeof gameCollection.$inferSelect;

function load() {
  return db.query.gameCollection.findFirst({ where: eq(gameCollection.id, ID) });
}

function due(row: GameCollection | undefined) {
  if (!row) return true;
  const wait = row.error || !row.loadedAt ? RETRY_MINUTES : FRESH_MINUTES;
  return Date.now() - row.checkedAt.getTime() >= wait * 60_000;
}

export type RefreshResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * Reads the list from Zatrolené hry and stores it; a failed read keeps the last good list.
 * One reader at a time: each claims the attempt by moving `checkedAt` on from the value it saw.
 * Null when the list is not due yet (unless `force`) or another reader got there first.
 */
export async function refreshGameCollection({ force = false } = {}): Promise<RefreshResult | null> {
  const row = await load();
  if (!force && !due(row)) return null;
  const checkedAt = new Date();
  const claimed = row
    ? await db
        .update(gameCollection)
        .set({ checkedAt })
        .where(and(eq(gameCollection.id, ID), eq(gameCollection.checkedAt, row.checkedAt)))
        .returning({ id: gameCollection.id })
    : await db.insert(gameCollection).values({ id: ID, checkedAt }).onConflictDoNothing().returning({ id: gameCollection.id });
  if (claimed.length === 0) return null;

  try {
    const games = await fetchClubCollection();
    await db.update(gameCollection).set({ games, loadedAt: new Date(), error: null }).where(eq(gameCollection.id, ID));
    return { ok: true, count: games.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("Reading the game collection from Zatrolené hry failed", e);
    await db.update(gameCollection).set({ error }).where(eq(gameCollection.id, ID));
    // a network hiccup or an outage there passes by itself; a changed page needs us, so say it once
    if (e instanceof PageChangedError && row?.error !== error) {
      await notifyOrganizers(
        "Seznam her se nepodařilo načíst",
        `Stránka Hry na webu si bere seznam her ze Zatrolených her (${clubCollectionUrl()}) a teď ho nepřečetla: ${error}. Web dál ukazuje naposledy načtený seznam. Nejspíš se změnila stránka nebo adresa klubu na Zatrolených hrách a načítání je potřeba upravit (src/lib/zatrolene.ts). Znovu načíst se dá na stránce Hry, když jsi přihlášený v adminu.`,
      );
    }
    return { ok: false, error };
  }
}

/**
 * The list for the games page. A list older than FRESH_MINUTES is shown as it is and read again
 * after the response; only the very first read is waited for.
 */
export async function getGameCollection(): Promise<GameCollection | null> {
  const row = await load();
  if (!row?.loadedAt) {
    if (!(await refreshGameCollection())) return row ?? null;
    return (await load()) ?? null;
  }
  if (due(row)) after(() => refreshGameCollection().catch((e) => console.error("Game collection refresh failed", e)));
  return row;
}

/** For the admin's warnings: the last read failed. */
export async function gameCollectionProblem() {
  const row = await load();
  return row?.error ? { error: row.error, loadedAt: row.loadedAt } : null;
}
