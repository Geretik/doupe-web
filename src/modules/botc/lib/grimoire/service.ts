import { and, asc, desc, eq, gt, isNotNull, lt, or, sql, TransactionRollbackError } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers, games, grimoires, registrations, scripts, sessions, type AdminUser, type Grimoire } from "@/db/schema";
import { hasRole } from "@/lib/admin-auth";
import { botcRoles, linkedRoleOf } from "@/modules/botc/lib/botc-roles";
import { saveRoster } from "@/modules/botc/lib/game-roster";
import { scriptToolLinkForJson } from "@/modules/botc/lib/draft/script";
import { libraryScriptExtras, libraryScriptToolLink } from "@/modules/botc/lib/scripts";
import type { RosterValue } from "@/lib/validation";
import { newGap, newGrimoireState, newSeat, players, type GrimoireState } from "./state";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The owner plays the grimoire; once the game has ended every account may look at it. */
export function canEditGrimoire(me: AdminUser, g: Pick<Grimoire, "ownerId">) {
  return g.ownerId === me.id;
}

export function canViewGrimoire(me: AdminUser, g: Pick<Grimoire, "ownerId" | "endedAt">) {
  return canEditGrimoire(me, g) || g.endedAt !== null;
}

/** Only the site's administrators delete grimoires: their own and every ended one (another account's running game stays hidden from them too). */
export function canDeleteGrimoire(me: AdminUser, g: Pick<Grimoire, "ownerId" | "endedAt">) {
  return hasRole(me, "admin") && canViewGrimoire(me, g);
}

/** Every character but the travellers: the "script" of a grimoire without one. */
export function allCharactersScript(name: string): GrimoireState["script"] {
  return { id: null, name, roleIds: botcRoles.filter((r) => r.team !== "traveller").map((r) => r.id) };
}

/** The club's library, for picking a grimoire's script: its characters, its Fabled and Loric, its homebrew. */
export async function grimoireScripts(): Promise<(GrimoireState["script"] & { id: number })[]> {
  const rows = await db
    .select({ id: scripts.id, name: scripts.name, roleIds: scripts.roleIds, json: scripts.json })
    .from(scripts)
    .orderBy(sql`lower(${scripts.name})`);
  return rows.map(({ json, ...script }) => ({ ...script, ...libraryScriptExtras({ json }) }));
}

/** Sessions a new grimoire can start from: the last week's and the coming weeks'. */
export async function grimoireSessions() {
  const now = Date.now();
  return db
    .select({ id: sessions.id, title: sessions.title, startsAt: sessions.startsAt })
    .from(sessions)
    .where(and(gt(sessions.startsAt, new Date(now - 7 * 864e5)), lt(sessions.startsAt, new Date(now + 60 * 864e5))))
    .orderBy(asc(sessions.startsAt));
}

const listColumns = {
  id: grimoires.id,
  name: grimoires.name,
  ownerId: grimoires.ownerId,
  owner: adminUsers.nickname,
  sessionId: grimoires.sessionId,
  sessionTitle: sessions.title,
  endedAt: grimoires.endedAt,
  updatedAt: grimoires.updatedAt,
  phase: sql<GrimoireState["phase"]>`${grimoires.state}->>'phase'`,
  round: sql<number>`(${grimoires.state}->>'round')::int`,
  scriptName: sql<string>`${grimoires.state}->'script'->>'name'`,
};

/** The account's grimoires and everyone's ended ones, the latest first; optionally of one session. */
export async function listGrimoires(me: AdminUser, sessionId?: number) {
  return db
    .select(listColumns)
    .from(grimoires)
    .innerJoin(adminUsers, eq(adminUsers.id, grimoires.ownerId))
    .leftJoin(sessions, eq(sessions.id, grimoires.sessionId))
    .where(and(or(eq(grimoires.ownerId, me.id), isNotNull(grimoires.endedAt)), sessionId ? eq(grimoires.sessionId, sessionId) : undefined))
    .orderBy(desc(grimoires.updatedAt))
    .limit(100);
}

export type GrimoireListItem = Awaited<ReturnType<typeof listGrimoires>>[number];

export async function getGrimoire(id: number) {
  const [row] = await db
    .select({ grimoire: grimoires, owner: adminUsers.nickname, sessionTitle: sessions.title })
    .from(grimoires)
    .innerJoin(adminUsers, eq(adminUsers.id, grimoires.ownerId))
    .leftJoin(sessions, eq(sessions.id, grimoires.sessionId))
    .where(eq(grimoires.id, id));
  return row ?? null;
}

/** The session's players: confirmed sign-ups not marked absent, by nickname. */
export async function sessionPlayers(sessionId: number, locale: string) {
  const rows = await db
    .select({ id: registrations.id, nickname: registrations.nickname, attended: registrations.attended })
    .from(registrations)
    .where(and(eq(registrations.sessionId, sessionId), eq(registrations.status, "confirmed")));
  return rows
    .filter((r) => r.attended !== false)
    .sort((a, b) => a.nickname.localeCompare(b.nickname, locale))
    .map(({ id, nickname }) => ({ id, nickname }));
}

export type NewGrimoire = {
  name: string | null;
  sessionId: number | null;
  scriptId: number | null;
  /** Another grimoire of the account: the next game with the same players in the same seats (and the same gaps) */
  fromId: number | null;
};

/**
 * Creates a grimoire and returns its id, or null when the session, script or grimoire to start from does
 * not exist. Seats come from the grimoire to start from, else from the session; the script is the one
 * picked, else the session's (by its name in the library), else every character.
 */
export async function createGrimoire(
  me: AdminUser,
  input: NewGrimoire,
  texts: { allCharacters: string; untitled: string; nthGame: (title: string, n: number) => string },
  locale: string,
): Promise<number | null> {
  let seats: GrimoireState["seats"] = [];
  let sessionId = input.sessionId;
  let script: GrimoireState["script"] | null = null;
  // the next game at the same table keeps the Fabled and Loric the Storyteller added
  let fabled: string[] | undefined;
  if (input.fromId) {
    const from = await db.query.grimoires.findFirst({ where: eq(grimoires.id, input.fromId) });
    if (!from || !canEditGrimoire(me, from)) return null;
    seats = from.state.seats.map((s) => (s.gap ? newGap(s.gap) : newSeat(s.name, s.registrationId)));
    sessionId = from.sessionId;
    script = from.state.script;
    fabled = from.state.fabled;
  }
  const session = sessionId ? await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) }) : undefined;
  if (sessionId && !session) return null;
  if (session && !input.fromId) seats = (await sessionPlayers(session.id, locale)).map((p) => newSeat(p.nickname, p.id));

  const library = await grimoireScripts();
  if (input.scriptId) {
    const picked = library.find((s) => s.id === input.scriptId);
    if (!picked) return null;
    script = picked;
  }
  if (!script && session) {
    const names = new Set(session.scripts.map((s) => s.name.trim().toLowerCase()));
    script = library.find((s) => names.has(s.name.trim().toLowerCase())) ?? null;
  }
  script ??= allCharactersScript(texts.allCharacters);

  let name = input.name;
  if (!name && session) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(grimoires).where(eq(grimoires.sessionId, session.id));
    name = texts.nthGame(session.title, n + 1);
  }
  const state = newGrimoireState(script, seats);
  const [row] = await db
    .insert(grimoires)
    .values({ name: name || texts.untitled, ownerId: me.id, sessionId: session?.id ?? null, state: fabled?.length ? { ...state, fabled } : state })
    .returning({ id: grimoires.id });
  return row.id;
}

/** Writes the game record of an ended grimoire into its session (a new one, or the one it wrote before); returns its id. */
async function writeGameRecord(tx: Tx, g: Grimoire, sessionId: number, state: GrimoireState) {
  const session = await tx.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) return null;
  let scriptUrl: string | null = null;
  if (state.script.id) {
    const [library] = await tx.select({ json: scripts.json }).from(scripts).where(eq(scripts.id, state.script.id));
    if (library) scriptUrl = libraryScriptToolLink(library);
  }
  const name = state.script.name.trim().toLowerCase();
  scriptUrl ??= session.scripts.find((s) => s.name.trim().toLowerCase() === name)?.url ?? null;
  // a pasted script is not stored; the script tool opens its characters
  if (!scriptUrl && state.script.json) scriptUrl = scriptToolLinkForJson([{ id: "_meta", name: state.script.name }, ...state.script.roleIds]);
  const bluffs = state.bluffs.filter((b): b is string => b !== null);
  const count = players(state).length;
  const values = {
    scriptName: state.script.name,
    scriptUrl,
    winner: state.winner,
    // the game form takes 5–20 players
    players: count >= 5 && count <= 20 ? count : null,
    demonBluffs: bluffs.length ? bluffs : null,
    // a grimoire ended before it had a note leaves the record's own note alone
    ...(state.notes !== undefined ? { notes: state.notes.trim() || null } : {}),
  };
  let gameId = g.gameId;
  if (gameId) {
    const [updated] = await tx.update(games).set(values).where(eq(games.id, gameId)).returning({ id: games.id });
    gameId = updated?.id ?? null;
  }
  if (!gameId) {
    const [created] = await tx.insert(games).values({ sessionId, ...values }).returning({ id: games.id });
    gameId = created.id;
  }
  const roster = new Map<number, RosterValue | undefined>();
  for (const s of state.seats) {
    if (!s.registrationId) continue;
    roster.set(s.registrationId, s.role ? { role: s.role, believedRole: linkedRoleOf(s.role) ? s.believedRole : null } : undefined);
  }
  await saveRoster(tx, gameId, sessionId, roster);
  return gameId;
}

export type SaveResult =
  | { ok: true; version: number; gameId: number | null; recorded: boolean }
  | { conflict: true; version: number; state: GrimoireState }
  | { notFound: true };

/**
 * Stores the page's state when it started from the stored version (`force` overwrites a newer one).
 * Saving an ended game writes its session's game record in the same transaction.
 */
export async function saveGrimoire(me: AdminUser, id: number, baseVersion: number, state: GrimoireState, force: boolean): Promise<SaveResult> {
  const g = await db.query.grimoires.findFirst({ where: eq(grimoires.id, id) });
  if (!g || !canEditGrimoire(me, g)) return { notFound: true };
  if (!force && g.version !== baseVersion) return { conflict: true, version: g.version, state: g.state };
  // an ended grimoire only changes by being ended (again, after "back into the game" – maybe within one save)
  const ending = state.phase === "ended";
  const result = await db.transaction(async (tx) => {
    const gameId = ending && g.sessionId ? await writeGameRecord(tx, g, g.sessionId, state) : g.gameId;
    const [saved] = await tx
      .update(grimoires)
      .set({
        state,
        version: sql`${grimoires.version} + 1`,
        gameId,
        endedAt: state.phase === "ended" ? (g.endedAt ?? new Date()) : null,
        updatedAt: new Date(),
      })
      // a save that came in between wins; this one is refused below
      .where(and(eq(grimoires.id, id), eq(grimoires.version, g.version)))
      .returning({ version: grimoires.version });
    if (!saved) tx.rollback();
    return { version: saved.version, gameId };
  }).catch((e) => {
    if (e instanceof TransactionRollbackError) return null;
    throw e;
  });
  if (!result) {
    const now = await db.query.grimoires.findFirst({ where: eq(grimoires.id, id) });
    return now ? { conflict: true, version: now.version, state: now.state } : { notFound: true };
  }
  return { ok: true, version: result.version, gameId: result.gameId, recorded: ending && result.gameId !== null };
}

export async function deleteGrimoire(me: AdminUser, id: number) {
  if (!hasRole(me, "admin")) return null;
  const [row] = await db
    .delete(grimoires)
    .where(and(eq(grimoires.id, id), or(eq(grimoires.ownerId, me.id), isNotNull(grimoires.endedAt))))
    .returning({ id: grimoires.id, name: grimoires.name, sessionId: grimoires.sessionId });
  return row ?? null;
}
