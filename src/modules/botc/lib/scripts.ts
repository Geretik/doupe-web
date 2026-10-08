import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers, scripts, type AdminUser, type LibraryScript, type ScriptLink } from "@/db/schema";
import { hasRole } from "@/lib/admin-auth";
import { matchStorytellerId } from "./botc-roles";
import { HOMEBREW_LIMITS, type Homebrew } from "./grimoire/state";
import { matchRoleId, sortRoleIds } from "./draft/roles";
import { scriptToolLinkForJson } from "./draft/script";

/*
 * The club's library of scripts (admin → Scripty): JSON files in the official script format – an array of
 * character ids or objects with an id, and a "_meta" entry with the name – as the official script tool,
 * botcscripts.com or the club's script tool export them. Every account sees all of them; the one who added
 * a script and administrators change or delete it.
 */

/** Bigger files are refused; a script with homebrew characters and their texts stays far below this. */
export const MAX_SCRIPT_BYTES = 512 * 1024;
/** Longest link the session form takes (lib/validation scriptUrlSchema); a longer one is not offered there. */
export const MAX_LINK = 2000;

export type ParsedScript = {
  items: unknown[];
  meta: { name: string | null; author: string | null };
  /** The characters this site knows, sorted */
  roleIds: string[];
  /** Entries that are no player's character (Fabled, Loric, homebrew), by name or id */
  extras: string[];
  /** The Fabled and Loric among them that the site knows, by id: the grimoire has them */
  fabled: string[];
  /** Its own rules and characters with their abilities, for the Bootlegger in the grimoire */
  homebrew: Homebrew;
};

const HOMEBREW_TEAMS = ["townsfolk", "outsider", "minion", "demon", "traveller", "fabled", "loric"];

export type ScriptFileError = "tooLarge" | "notJson" | "notScript" | "noCharacters";

function isMeta(item: unknown): item is Record<string, unknown> {
  return Boolean(item && typeof item === "object" && (item as { id?: unknown }).id === "_meta");
}

function entryId(item: unknown): string | null {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") return (item as { id: string }).id;
  return null;
}

/** Reads a script file; what it cannot use is an error, so a wrong file is never saved. */
export function parseScriptFile(text: string): { ok: true; script: ParsedScript } | { ok: false; error: ScriptFileError } {
  if (Buffer.byteLength(text, "utf8") > MAX_SCRIPT_BYTES) return { ok: false, error: "tooLarge" };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "notJson" };
  }
  if (!Array.isArray(data) || data.some((item) => entryId(item) === null)) return { ok: false, error: "notScript" };
  const meta = data.find(isMeta);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const clip = (v: unknown, max: number) => str(v)?.slice(0, max) ?? null;
  const roleIds: string[] = [];
  const extras: string[] = [];
  const fabled: string[] = [];
  const homebrew: Homebrew = { rules: [], characters: [] };
  if (Array.isArray(meta?.bootlegger)) {
    homebrew.rules = meta.bootlegger.flatMap((rule) => clip(rule, HOMEBREW_LIMITS.text) ?? []).slice(0, HOMEBREW_LIMITS.rules);
  }
  for (const item of data) {
    if (isMeta(item)) continue;
    const id = matchRoleId(entryId(item)!);
    if (id) {
      roleIds.push(id);
      continue;
    }
    extras.push(str((item as { name?: unknown })?.name) ?? entryId(item)!);
    // the official Fabled or Loric: not a homebrew character of a player's team that happens to share its id
    const storyteller = matchStorytellerId(entryId(item)!);
    const team = (item as { team?: unknown })?.team;
    if (storyteller && (team === undefined || team === "fabled" || team === "loric")) {
      if (!fabled.includes(storyteller)) fabled.push(storyteller);
      continue;
    }
    // a homebrew character: one with its own ability
    const ability = clip((item as { ability?: unknown })?.ability, HOMEBREW_LIMITS.text);
    if (ability && homebrew.characters.length < HOMEBREW_LIMITS.characters) {
      const name = clip((item as { name?: unknown }).name, HOMEBREW_LIMITS.name) ?? entryId(item)!.slice(0, HOMEBREW_LIMITS.name);
      homebrew.characters.push({ name, team: typeof team === "string" && HOMEBREW_TEAMS.includes(team) ? team : null, ability });
    }
  }
  if (roleIds.length + extras.length === 0) return { ok: false, error: "noCharacters" };
  return {
    ok: true,
    script: { items: data, meta: { name: str(meta?.name), author: str(meta?.author) }, roleIds: sortRoleIds(new Set(roleIds)), extras, fabled, homebrew },
  };
}

/** The file as saved: name and author written into its "_meta" (first), everything else as it was. */
export function scriptText(items: unknown[], name: string, author: string | null) {
  const meta: Record<string, unknown> = { id: "_meta", ...(items.find(isMeta) ?? {}), name };
  if (author) meta.author = author;
  else delete meta.author;
  return JSON.stringify([meta, ...items.filter((item) => !isMeta(item))], null, 2);
}

/** Entries of a saved script that are no player's character, for showing them under the characters. */
export function scriptExtras(script: Pick<LibraryScript, "json">): string[] {
  const parsed = parseScriptFile(script.json);
  return parsed.ok ? parsed.script.extras : [];
}

/** What a grimoire takes from a script besides its characters: its Fabled and Loric, its homebrew; only what it has. */
export function grimoireScriptExtras(script: Pick<ParsedScript, "fabled" | "homebrew">) {
  const { fabled, homebrew } = script;
  return {
    ...(fabled.length ? { fabled } : {}),
    ...(homebrew.rules.length || homebrew.characters.length ? { homebrew } : {}),
  };
}

/** The same of a saved script. */
export function libraryScriptExtras(script: Pick<LibraryScript, "json">) {
  const parsed = parseScriptFile(script.json);
  return parsed.ok ? grimoireScriptExtras(parsed.script) : {};
}

export function libraryScriptToolLink(script: Pick<LibraryScript, "json">) {
  return scriptToolLinkForJson(JSON.parse(script.json));
}

export function canEditScript(me: AdminUser, script: Pick<LibraryScript, "createdBy">) {
  return script.createdBy === me.id || hasRole(me, "admin");
}

export async function listScripts() {
  return db
    .select({ script: scripts, creator: adminUsers.nickname })
    .from(scripts)
    .leftJoin(adminUsers, eq(adminUsers.id, scripts.createdBy))
    .orderBy(sql`lower(${scripts.name})`);
}

export async function getLibraryScript(id: number) {
  const [row] = await db
    .select({ script: scripts, creator: adminUsers.nickname })
    .from(scripts)
    .leftJoin(adminUsers, eq(adminUsers.id, scripts.createdBy))
    .where(eq(scripts.id, id));
  return row ?? null;
}

/** Names are unique regardless of case: the session form finds a script by its name. `q`: a transaction to ask in. */
export async function scriptNameTaken(name: string, exceptId?: number, q: Pick<typeof db, "select"> = db) {
  const [row] = await q
    .select({ id: scripts.id })
    .from(scripts)
    .where(and(sql`lower(${scripts.name}) = lower(${name})`, exceptId ? ne(scripts.id, exceptId) : undefined))
    .limit(1);
  return Boolean(row);
}

/** The library for the session form: by name with a link to the script tool (none when too long for the form). */
export async function libraryScriptLinks(): Promise<ScriptLink[]> {
  const rows = await db.select({ name: scripts.name, json: scripts.json }).from(scripts).orderBy(desc(scripts.updatedAt));
  return rows.map((r) => {
    const url = libraryScriptToolLink(r);
    return { name: r.name, url: url.length <= MAX_LINK ? url : "" };
  });
}
