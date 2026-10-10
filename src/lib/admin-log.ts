import { and, desc, eq, inArray, like, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adminLog,
  adminUsers,
  drafts,
  draftScripts,
  draftSessions,
  grimoires,
  registrations,
  scripts,
  sessions,
  type AdminLogRow,
  type AdminRole,
  type AttendanceAffiliation,
  type RegistrationState,
} from "@/db/schema";

/*
 * The admin's history (admin → Historie): who did what and when. Every server action of the admin that changes
 * something calls logAction once it succeeded; the grimoire's autosave during a game is left out (only creating,
 * recording the game and deleting are logged), and so are actions nobody is logged in for (a forgotten-password
 * request), except the logins they lead to.
 */

/** The daily cron deletes rows older than this. */
export const LOG_RETENTION_DAYS = 365;
export const LOG_PAGE_SIZE = 100;

/** What an entry is about, as it was then: deleted or renamed later, the entry still says what it was. */
export type SessionRef = { id: number; title: string; /** ISO */ startsAt: string };
export type NamedRef = { id: number; name: string };
export type AccountRef = { id: number; nickname: string };

export type LoginMethod = "password" | "link" | "qr" | "reset" | "invite" | "setup";
export type LogValue = string | number | boolean | null;
/** One changed field; `from` and `to` only for short values that are not personal. */
export type FieldChange = { field: string; from?: LogValue; to?: LogValue };

type OnSession = { session: SessionRef };
/** A player is only their registration: the page shows the nickname as it is now, so erasing it erases it here too. */
type OnPlayer = OnSession & { registrationId: number };
type OnDraft = { draft: NamedRef };
/** A script made in a draft (draft_scripts), not one of the library */
type OnDraftScript = OnDraft & { draftScript: NamedRef };
type Nothing = Record<string, never>;
/** An entry of the club's attendance sheet: its night ("YYYY-MM-DD") and how the person is related to UP */
type OnNight = { day: string; affiliation: AttendanceAffiliation };
/** A game of the club's collection lent or given a bar code: its id on Zatrolené hry and its name */
type OnGame = { game: NamedRef };

export type LogData = {
  "account.login": { method: LoginMethod; device?: string };
  "account.logoutOthers": Nothing;
  "account.password": Nothing;
  "account.feedKey": Nothing;
  "account.sessionEmails": { enabled: boolean };
  "account.inviteCreate": { role: AdminRole; note: string | null };
  "account.inviteRevoke": { role: AdminRole; note: string | null };
  "account.resetLink": { account: AccountRef };
  "account.delete": { account: AccountRef & { role: AdminRole } };
  "web.texts": { page: string; locale: string; blocks: string[]; intent: "save" | "default" | "restore" };
  "session.create": OnSession & { count: number };
  "session.update": OnSession & { changes: FieldChange[] };
  "session.delete": OnSession;
  "session.registration": OnSession & { state: RegistrationState };
  "session.poll": OnSession & { closed: boolean };
  "session.broadcast": OnSession & { subject: string; sent: number; failed: number };
  "session.reminders": OnSession & { sent: number; failed: number };
  "session.discord": OnSession & { result: "sent" | "not_configured" | "failed" };
  "session.emails": OnSession & { enabled: boolean };
  "session.gameAdd": OnSession & { gameId: number };
  "session.gameUpdate": OnSession & { gameId: number };
  "session.gameDelete": OnSession & { gameId: number };
  "session.playerAdd": OnPlayer;
  "session.playerUpdate": OnPlayer & { changes: FieldChange[] };
  "session.playerCancel": OnPlayer;
  "session.playerRestore": OnPlayer & { waitlisted: boolean };
  "session.playerConfirm": OnPlayer;
  "session.attendance": OnPlayer & { attended: boolean | null };
  "session.resendLink": OnPlayer;
  "session.playerErase": OnPlayer & { count: number };
  "draft.create": OnDraft;
  "draft.update": OnDraft;
  "draft.delete": OnDraft;
  "draft.invite": OnDraft & { nicknames: string[] };
  "draft.respond": OnDraft & { accept: boolean };
  "draft.member": OnDraft & { member: string; role?: "organizer" | "participant"; drafts?: boolean };
  "draft.remove": OnDraft & { member: string };
  "draft.move": OnDraft & { member: string; delta: -1 | 1 };
  "draft.shuffle": OnDraft;
  "draft.start": OnDraft;
  "draft.cancel": OnDraft;
  "draft.pick": OnDraft & { roleIds: string[] };
  "draft.scriptCreate": OnDraftScript;
  "draft.scriptSave": OnDraftScript;
  "draft.scriptLibrary": OnDraftScript & { libraryId: number; updated: boolean };
  "draft.scriptDelete": OnDraftScript;
  "script.create": { script: NamedRef };
  "script.update": { script: NamedRef; file: boolean };
  "script.delete": { script: NamedRef };
  "grimoire.create": { grimoire: NamedRef };
  "grimoire.delete": { grimoire: NamedRef };
  "grimoire.record": { grimoire: NamedRef; session: SessionRef | null };
  /** Who is on the sheet stays out of the log, like a player's name: only the night and the affiliation */
  "attendance.add": OnNight;
  "attendance.delete": OnNight;
  /** A game of the club's collection (its id on Zatrolené hry); who borrowed it stays out, like a name on the attendance sheet */
  "loan.lend": OnGame;
  "loan.return": OnGame;
  "loan.code": OnGame & { code: string };
  "loan.codeRemove": OnGame & { code: string };
};

export type LogAction = keyof LogData;

export const logAreas = ["session", "draft", "grimoire", "script", "web", "attendance", "loan", "account"] as const;
export type LogArea = (typeof logAreas)[number];

export function isLogArea(v: unknown): v is LogArea {
  return logAreas.includes(v as LogArea);
}

type Actor = { id: number; nickname: string };

/**
 * Writes one entry. Never throws: a failed write is only reported in the server log, the action itself already
 * happened. `actor` may be an account id (logins, where only that is at hand).
 */
export async function logAction<A extends LogAction>(actor: Actor | number, action: A, data: LogData[A]) {
  try {
    const who =
      typeof actor === "number"
        ? await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, actor), columns: { id: true, nickname: true } })
        : actor;
    if (!who) return;
    await db.insert(adminLog).values({ userId: who.id, nickname: who.nickname, action, data });
  } catch (e) {
    console.error(`Admin log entry ${action} could not be written`, e);
  }
}

/** The session as the log keeps it, or null when it is gone. */
export async function sessionRef(id: number): Promise<SessionRef | null> {
  const s = await db.query.sessions.findFirst({ where: eq(sessions.id, id), columns: { id: true, title: true, startsAt: true } });
  return s ? { id: s.id, title: s.title, startsAt: s.startsAt.toISOString() } : null;
}

type SessionAction = { [A in LogAction]: LogData[A] extends OnSession ? A : never }[LogAction];

/** logAction for an action on a session, which is looked up by its id; nothing is logged when it is gone. */
export async function logSessionAction<A extends SessionAction>(actor: Actor, action: A, sessionId: number, data: Omit<LogData[A], "session">) {
  const session = await sessionRef(sessionId).catch(() => null);
  if (session) await logAction(actor, action, { ...data, session } as LogData[A]);
}

type DraftAction = { [A in LogAction]: LogData[A] extends OnDraft ? A : never }[LogAction];

/** logAction for an action on a draft's run, logged under its draft; nothing is logged when it is gone. */
export async function logDraftAction<A extends DraftAction>(actor: Actor, action: A, draftSessionId: number, data: Omit<LogData[A], "draft">) {
  const draft = await draftRefOfSession(draftSessionId).catch(() => null);
  if (draft) await logAction(actor, action, { ...data, draft } as LogData[A]);
}

/** Old and new value of each field that differs; values only for the fields in `withValues`. */
export function fieldChanges<T extends Record<string, unknown>>(before: T, after: Partial<T>, withValues: readonly (keyof T)[] = []): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of Object.keys(after) as (keyof T & string)[]) {
    const from = logValue(before[field]);
    const to = logValue(after[field]);
    if (stableJson(from) === stableJson(to)) continue;
    changes.push(withValues.includes(field) && isShort(from) && isShort(to) ? { field, from, to } : { field });
  }
  return changes;
}

function logValue(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  return v === undefined ? null : v;
}

/** JSON with the keys of objects sorted: Postgres gives jsonb back in its own key order. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    // a key left undefined is not stored at all
    const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

function isShort(v: unknown): v is LogValue {
  return v === null || typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 100);
}

export type LogFilter = { userId?: number; area?: LogArea; sessionId?: number; before?: number };

export type LogEntry = Omit<AdminLogRow, "action" | "data"> & { [A in LogAction]: { action: A; data: LogData[A] } }[LogAction];

/**
 * One page of the history, newest first, with what the page needs to show it: the players' nicknames as they are
 * now and which sessions, drafts, scripts and grimoires still exist (only those get a link).
 */
export async function listAdminLog(filter: LogFilter) {
  const rows = await db
    .select()
    .from(adminLog)
    .where(
      and(
        filter.userId ? eq(adminLog.userId, filter.userId) : undefined,
        filter.area ? like(adminLog.action, `${filter.area}.%`) : undefined,
        filter.sessionId ? sql`${adminLog.data} -> 'session' ->> 'id' = ${String(filter.sessionId)}` : undefined,
        filter.before ? lt(adminLog.id, filter.before) : undefined,
      ),
    )
    .orderBy(desc(adminLog.id))
    .limit(LOG_PAGE_SIZE + 1);
  const entries = rows.slice(0, LOG_PAGE_SIZE) as LogEntry[];

  const ids = { players: new Set<number>(), sessions: new Set<number>(), drafts: new Set<number>(), draftScripts: new Set<number>(), scripts: new Set<number>(), grimoires: new Set<number>() };
  for (const { data } of entries) {
    if ("registrationId" in data) ids.players.add(data.registrationId);
    if ("session" in data && data.session) ids.sessions.add(data.session.id);
    if ("draft" in data) ids.drafts.add(data.draft.id);
    if ("draftScript" in data) ids.draftScripts.add(data.draftScript.id);
    if ("script" in data) ids.scripts.add(data.script.id);
    if ("libraryId" in data) ids.scripts.add(data.libraryId);
    if ("grimoire" in data) ids.grimoires.add(data.grimoire.id);
  }
  const existing = async <T extends { id: number }>(set: Set<number>, query: (ids: number[]) => Promise<T[]>) =>
    set.size ? await query([...set]) : [];
  const idsOf = (table: typeof sessions | typeof drafts | typeof draftScripts | typeof scripts | typeof grimoires) => (list: number[]) =>
    db.select({ id: table.id }).from(table).where(inArray(table.id, list));
  const [players, liveSessions, liveDrafts, liveDraftScripts, liveScripts, liveGrimoires] = await Promise.all([
    existing(ids.players, (list) => db.select({ id: registrations.id, nickname: registrations.nickname }).from(registrations).where(inArray(registrations.id, list))),
    existing(ids.sessions, idsOf(sessions)),
    existing(ids.drafts, idsOf(drafts)),
    existing(ids.draftScripts, idsOf(draftScripts)),
    existing(ids.scripts, idsOf(scripts)),
    existing(ids.grimoires, idsOf(grimoires)),
  ]);
  return {
    entries,
    /** id of the oldest entry shown, when there are older ones */
    olderThan: rows.length > LOG_PAGE_SIZE ? entries[entries.length - 1].id : null,
    playerNicknames: new Map(players.map((p) => [p.id, p.nickname])),
    exists: {
      session: new Set(liveSessions.map((r) => r.id)),
      draft: new Set(liveDrafts.map((r) => r.id)),
      draftScript: new Set(liveDraftScripts.map((r) => r.id)),
      script: new Set(liveScripts.map((r) => r.id)),
      grimoire: new Set(liveGrimoires.map((r) => r.id)),
    },
  };
}

/** Run by the daily cron. */
export async function deleteOldAdminLog() {
  await db.delete(adminLog).where(lt(adminLog.at, new Date(Date.now() - LOG_RETENTION_DAYS * 864e5)));
}

/** The draft of a draft run, as the log keeps it. */
export async function draftRefOfSession(draftSessionId: number): Promise<NamedRef | null> {
  const [row] = await db
    .select({ id: drafts.id, name: drafts.name })
    .from(draftSessions)
    .innerJoin(drafts, eq(draftSessions.draftId, drafts.id))
    .where(eq(draftSessions.id, draftSessionId));
  return row ?? null;
}

/** A draft's script and its draft, as the log keeps them. */
export async function draftScriptRef(scriptId: number): Promise<{ draft: NamedRef; draftScript: NamedRef } | null> {
  const [row] = await db
    .select({ id: draftScripts.id, name: draftScripts.name, draftId: drafts.id, draftName: drafts.name })
    .from(draftScripts)
    .innerJoin(draftSessions, eq(draftScripts.sessionId, draftSessions.id))
    .innerJoin(drafts, eq(draftSessions.draftId, drafts.id))
    .where(eq(draftScripts.id, scriptId));
  return row ? { draft: { id: row.draftId, name: row.draftName }, draftScript: { id: row.id, name: row.name } } : null;
}
