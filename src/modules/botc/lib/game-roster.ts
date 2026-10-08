import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { gamePlayers, registrations } from "@/db/schema";
import type { RosterValue } from "@/lib/validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Stores who played what in a game (the game form in the admin, an ended grimoire). Only the players given
 * are touched, and only players of the game's session count; undefined removes what was entered for a player.
 */
export async function saveRoster(tx: Tx, gameId: number, sessionId: number, roster: Map<number, RosterValue | undefined>) {
  const ids = [...roster.keys()];
  if (ids.length === 0) return;
  const ofSession = await tx
    .select({ id: registrations.id })
    .from(registrations)
    .where(and(eq(registrations.sessionId, sessionId), inArray(registrations.id, ids)));
  await tx.delete(gamePlayers).where(and(eq(gamePlayers.gameId, gameId), inArray(gamePlayers.registrationId, ids)));
  const rows = ofSession.flatMap(({ id }) => {
    const value = roster.get(id);
    return value === undefined ? [] : [{ gameId, registrationId: id, ...value }];
  });
  if (rows.length > 0) await tx.insert(gamePlayers).values(rows);
}
