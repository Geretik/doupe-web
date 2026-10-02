import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { registrations, sessions, tables, type Registration, type Table } from "@/db/schema";

export const TABLE_MIN = 7;
export const TABLE_MAX = 15;

export type TableWithPlayers = Table & { players: Registration[] };

/** Tables of a session with their confirmed players, in table order. */
export async function listTables(sessionId: number): Promise<TableWithPlayers[]> {
  const rows = await db.select().from(tables).where(eq(tables.sessionId, sessionId)).orderBy(asc(tables.number));
  if (rows.length === 0) return [];
  const regs = await db
    .select()
    .from(registrations)
    .where(and(eq(registrations.sessionId, sessionId), eq(registrations.status, "confirmed")))
    .orderBy(asc(registrations.createdAt));
  return rows.map((t) => ({ ...t, players: regs.filter((r) => r.tableId === t.id) }));
}

/** Creates `count` numbered tables (replacing any existing ones). */
export async function createTables(sessionId: number, count: number) {
  // locked, so a double click cannot interleave and leave tables 1, 2, 1, 2
  await db.transaction(async (tx) => {
    await tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, sessionId)).for("update");
    await tx.delete(tables).where(eq(tables.sessionId, sessionId));
    await tx.insert(tables).values(Array.from({ length: count }, (_, i) => ({ sessionId, number: i + 1 })));
  });
}

/**
 * Splits confirmed players evenly over the tables: willing storytellers first (one per table),
 * newcomers spread out, then everybody else. Deterministic – runs in sign-up order.
 */
export async function autoAssign(sessionId: number) {
  const list = await listTables(sessionId);
  if (list.length === 0) return;
  const regs = await db
    .select()
    .from(registrations)
    .where(and(eq(registrations.sessionId, sessionId), eq(registrations.status, "confirmed")))
    .orderBy(asc(registrations.createdAt));
  const buckets: number[][] = list.map(() => []);
  const order = [
    ...regs.filter((r) => r.canStorytell),
    ...regs.filter((r) => !r.canStorytell && r.isNewbie),
    ...regs.filter((r) => !r.canStorytell && !r.isNewbie),
  ];
  // round-robin keeps the counts within one of each other and storytellers on different tables
  order.forEach((r, i) => buckets[i % list.length].push(r.id));
  for (let i = 0; i < list.length; i++) {
    if (buckets[i].length) {
      await db.update(registrations).set({ tableId: list[i].id }).where(inArray(registrations.id, buckets[i]));
    }
  }
}

/** Human-readable problems with a table's composition. */
export function tableIssues(t: TableWithPlayers, labels: { tooSmall: string; tooBig: string; noStoryteller: string }) {
  const out: string[] = [];
  if (t.players.length < TABLE_MIN) out.push(labels.tooSmall);
  if (t.players.length > TABLE_MAX) out.push(labels.tooBig);
  if (!t.storyteller && !t.players.some((p) => p.canStorytell)) out.push(labels.noStoryteller);
  return out;
}
