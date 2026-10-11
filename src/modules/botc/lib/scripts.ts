import { gunzipSync } from "node:zlib";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers, scripts, type AdminUser, type LibraryScript, type ScriptLink } from "@/db/schema";
import { hasRole } from "@/lib/admin-auth";
import { siteUrl } from "@/lib/site";
import {
  findRole,
  findStorytellerRole,
  homebrewStorytellerRoles,
  isHomebrew,
  matchHomebrew,
  matchStorytellerId,
  storytellerRoles,
  type ScriptNames,
} from "./botc-roles";
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

/**
 * The script of a script tool link – `…?script=<gzip + base64>` as the club's script tool, botcscript.app or their
 * share links write it (URL-safe base64 or the older one, whose "+" a query string may have turned into a space) –
 * as JSON text; null when the text is no such link.
 */
export function scriptFromToolLink(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  const encoded = url.searchParams.get("script");
  if (!encoded || !/^https?:$/.test(url.protocol)) return null;
  const bytes = Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/").replace(/ /g, "+"), "base64");
  try {
    // a gzip file starts 1f 8b; the oldest links have the JSON itself
    return (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes, { maxOutputLength: MAX_SCRIPT_BYTES + 1 }) : bytes).toString("utf8");
  } catch {
    return null;
  }
}

export type ParsedScript = {
  items: unknown[];
  meta: { name: string | null; author: string | null };
  /** The characters this site knows (the homebrew ones of its collections too), sorted */
  roleIds: string[];
  /** Entries that are no player's character (Fabled, Loric, homebrew the site does not know), by name or id */
  extras: string[];
  /** The Fabled and Loric among them that the site knows, by id: the grimoire has them */
  fabled: string[];
  /** Its own rules and the homebrew characters the site does not know, with their abilities, for the Bootlegger in the grimoire */
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

/** Reads a script file, or a script tool link with the script in it; what it cannot use is an error, so a wrong file is never saved. */
export function parseScriptFile(input: string): { ok: true; script: ParsedScript } | { ok: false; error: ScriptFileError } {
  const text = scriptFromToolLink(input) ?? input;
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
    // a homebrew character of the site's collections (botc-roles homebrewRoles): a player's one like the official
    // ones, a Fabled or Loric among the Fabled
    const known = matchHomebrew(item);
    if (known && findRole(known)) {
      roleIds.push(known);
      continue;
    }
    extras.push(str((item as { name?: unknown })?.name) ?? entryId(item)!);
    if (known) {
      if (!fabled.includes(known)) fabled.push(known);
      continue;
    }
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
  // homebrew needs the Bootlegger (the official rule; the script tool adds it too), whose panel in the grimoire shows it
  const hasHomebrew = roleIds.some(isHomebrew) || fabled.some(isHomebrew) || homebrew.rules.length > 0 || homebrew.characters.length > 0;
  if (hasHomebrew && !fabled.includes("bootlegger")) fabled.push("bootlegger");
  return {
    ok: true,
    script: { items: data, meta: { name: str(meta?.name), author: str(meta?.author) }, roleIds: sortRoleIds(new Set(roleIds)), extras, fabled, homebrew },
  };
}

/** A script entry's character on this site – a player's, a Fabled or a Loric, official or homebrew – or null. */
function knownCharacter(item: unknown): string | null {
  const id = entryId(item);
  if (!id) return null;
  return matchRoleId(id) ?? matchHomebrew(item) ?? matchStorytellerId(id);
}

/** Order of the Storyteller's characters in a built script: the official ones as listed, then the homebrew ones */
const storytellerOrder = new Map([...storytellerRoles, ...homebrewStorytellerRoles].map((r, i) => [r.id, i]));

/**
 * The entries of a script built from characters picked on the site (the script builder): the players' characters
 * in the usual order, then the Fabled and Loric – by id, homebrew ones too (the tools get them in full, see
 * homebrew.ts). `previous`: the entries of the script it replaces, whose "_meta" (homebrew rules, logo…) and
 * entries the site does not know stay as they were.
 */
export function builtScriptItems(picked: string[], previous: unknown[] = []): unknown[] {
  const players = sortRoleIds(picked.filter((id) => findRole(id)));
  const storyteller = [...new Set(picked.filter((id) => findStorytellerRole(id)))].sort(
    (a, b) => storytellerOrder.get(a)! - storytellerOrder.get(b)!,
  );
  const meta = previous.filter(isMeta);
  const unknown = previous.filter((item) => !isMeta(item) && !knownCharacter(item));
  return [...meta, ...players, ...storyteller, ...unknown];
}

/** The characters of a library script the builder starts from: those the site knows, by their id here. */
export function knownCharactersOf(script: Pick<LibraryScript, "json">): string[] {
  const parsed = parseScriptFile(script.json);
  if (!parsed.ok) return [];
  return [...new Set(parsed.script.items.flatMap((item) => (isMeta(item) ? [] : (knownCharacter(item) ?? []))))];
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

/**
 * A short link of a library script, /botc/script/<id>: it opens the script tool with the script as the library has
 * it then. Short enough for a session's scripts and a Discord post, whatever the script (the tool's own link carries
 * the whole script, homebrew characters with their texts too).
 */
export function libraryScriptShortLink(id: number) {
  return `${siteUrl()}/botc/script/${id}`;
}

export function canEditScript(me: AdminUser, script: Pick<LibraryScript, "createdBy">) {
  return script.createdBy === me.id || hasRole(me, "admin");
}

/**
 * A saved script with its characters as the site reads its file today: `role_ids` is worked out on save, and a
 * homebrew character the site learns later (`npm run homebrew`) is one of them only from then on.
 */
export function withCurrentRoles<T extends Pick<LibraryScript, "json" | "roleIds">>(script: T): T {
  const parsed = parseScriptFile(script.json);
  return parsed.ok ? { ...script, roleIds: parsed.script.roleIds } : script;
}

export async function listScripts() {
  const rows = await db
    .select({ script: scripts, creator: adminUsers.nickname })
    .from(scripts)
    .leftJoin(adminUsers, eq(adminUsers.id, scripts.createdBy))
    .orderBy(sql`lower(${scripts.name})`);
  return rows.map((r) => ({ ...r, script: withCurrentRoles(r.script) }));
}

export async function getLibraryScript(id: number) {
  const [row] = await db
    .select({ script: scripts, creator: adminUsers.nickname })
    .from(scripts)
    .leftJoin(adminUsers, eq(adminUsers.id, scripts.createdBy))
    .where(eq(scripts.id, id));
  return row ? { ...row, script: withCurrentRoles(row.script) } : null;
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

/** What the library's script of this name (in any case) calls its characters; null when it renames none or there is no such script. */
export async function libraryNamesFor(scriptName: string): Promise<ScriptNames | null> {
  const [row] = await db
    .select({ names: scripts.names })
    .from(scripts)
    .where(sql`lower(${scripts.name}) = lower(${scriptName.trim()})`)
    .limit(1);
  return row?.names && Object.keys(row.names).length ? row.names : null;
}

/** The homebrew characters of the library's scripts, by the script's name in lower case: the game form offers them. */
export async function homebrewByScript(): Promise<Record<string, string[]>> {
  const rows = await db.select({ name: scripts.name, json: scripts.json, roleIds: scripts.roleIds }).from(scripts);
  return Object.fromEntries(
    rows.flatMap((r) => {
      const ids = withCurrentRoles(r).roleIds.filter(isHomebrew);
      return ids.length ? [[r.name.trim().toLowerCase(), ids]] : [];
    }),
  );
}

/** The library for the session form: by name with its short link to the script tool. */
export async function libraryScriptLinks(): Promise<ScriptLink[]> {
  const rows = await db.select({ id: scripts.id, name: scripts.name }).from(scripts).orderBy(desc(scripts.updatedAt));
  return rows.map((r) => ({ name: r.name, url: libraryScriptShortLink(r.id) }));
}
