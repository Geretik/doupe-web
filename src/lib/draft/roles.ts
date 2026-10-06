import type { DraftRoleSource } from "@/db/schema";
import { botcRoles, findRole, roleTeams, type BotcRole, type RoleEdition, type RoleTeam } from "../botc-roles";

/*
 * Which characters a draft offers and in what pieces. Pure functions – no database – shared by the admin
 * pages, the server actions and the tests.
 */

export const roleEditions: readonly RoleEdition[] = ["tb", "bmr", "snv", "carousel"];

/** Teams drafted by default; travellers join a game on their own, so they are offered only on request. */
export const defaultDraftTeams: readonly RoleTeam[] = ["townsfolk", "outsider", "minion", "demon"];

/** Characters drafted only together, as one pick, unless the Draft says otherwise. */
export const DEFAULT_BUNDLES: readonly (readonly string[])[] = [
  ["choirboy", "king"],
  ["huntsman", "damsel"],
];

/** Order of characters everywhere in drafts: by team, then by the English name (the same in both languages). */
const teamOrder = new Map(roleTeams.map((t, i) => [t, i]));
function compareRoles(a: BotcRole, b: BotcRole) {
  return teamOrder.get(a.team)! - teamOrder.get(b.team)! || a.en.localeCompare(b.en, "en");
}

/** Ids sorted by team and name; unknown ids are dropped. */
export function sortRoleIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)]
    .map((id) => findRole(id))
    .filter((r): r is BotcRole => Boolean(r))
    .sort(compareRoles)
    .map((r) => r.id);
}

/** The characters a role source stands for, sorted. */
export function resolveRoleSource(source: DraftRoleSource): string[] {
  if (source.kind === "manual") return sortRoleIds(source.roleIds);
  const editions = new Set(source.editions);
  const teams = new Set(source.teams);
  return sortRoleIds(botcRoles.filter((r) => editions.has(r.edition) && teams.has(r.team)).map((r) => r.id));
}

/**
 * Character id from what a person or a script file may write: an id ("fortuneteller"), the official tool's
 * older spelling ("fortune_teller"), or the English or Czech name ("Fortune Teller", "Vědma").
 */
export function matchRoleId(text: string): string | null {
  const key = normalize(text);
  if (!key) return null;
  return byKey.get(key) ?? null;
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const byKey = new Map<string, string>();
for (const r of botcRoles) {
  for (const k of [r.id, r.en, r.cs]) {
    const key = normalize(k);
    if (!byKey.has(key)) byKey.set(key, r.id);
  }
}

/**
 * Character ids from a script's JSON as the official script tool, botcscripts.com or the club's script tool
 * export it: an array of ids or of objects with an id, plus a "_meta" entry. Characters this site does not know
 * (Fabled, Loric, homebrew) are left out.
 */
export function roleIdsFromScriptJson(json: string): string[] | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  const ids: string[] = [];
  for (const item of data) {
    const raw = typeof item === "string" ? item : item && typeof item === "object" && "id" in item ? String(item.id) : null;
    const id = raw && raw !== "_meta" ? matchRoleId(raw) : null;
    if (id) ids.push(id);
  }
  return sortRoleIds(ids);
}

/** Bundles as written in the Draft form: one per line, characters split by "+" or ",". */
export function parseBundles(text: string): { bundles: string[][]; unknown: string[] } {
  const bundles: string[][] = [];
  const unknown: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(/[+,]/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    const ids: string[] = [];
    for (const p of parts) {
      const id = matchRoleId(p);
      if (id) ids.push(id);
      else unknown.push(p);
    }
    if (ids.length) bundles.push(ids);
  }
  return { bundles, unknown };
}

export type BundleProblem =
  /** fewer than two characters – it would only be a single character */
  | { kind: "tooSmall"; roleIds: string[] }
  /** a character in two bundles */
  | { kind: "overlap"; roleId: string };

/** Mistakes in a list of bundles; an empty list means it can be saved. */
export function bundleProblems(bundles: string[][]): BundleProblem[] {
  const problems: BundleProblem[] = [];
  const seen = new Set<string>();
  for (const b of bundles) {
    const unique = [...new Set(b)];
    if (unique.length < 2) problems.push({ kind: "tooSmall", roleIds: unique });
    for (const id of unique) {
      if (seen.has(id)) problems.push({ kind: "overlap", roleId: id });
      seen.add(id);
    }
  }
  return problems;
}

/** One thing to pick: a single character or a bundle; a pick adds all its characters to the pool. */
export type OptionSpec = { roleIds: string[] };

export type OptionsResult = {
  options: OptionSpec[];
  /** Bundles not offered because some of their characters are missing from the role pool */
  incompleteBundles: { roleIds: string[]; missing: string[] }[];
};

/**
 * What a session offers, built from the Draft's characters and bundles: a character that belongs to a bundle is
 * only offered as the whole bundle, and a bundle only when all its characters are in the pool – so a bundle
 * never splits, whatever its characters are. Bundles come first, then single characters in role order.
 */
export function buildOptions(roleIds: string[], bundles: string[][]): OptionsResult {
  const pool = new Set(roleIds);
  const inBundle = new Set(bundles.flat());
  const options: OptionSpec[] = [];
  const incompleteBundles: OptionsResult["incompleteBundles"] = [];
  for (const b of bundles) {
    const ids = sortRoleIds(b);
    const missing = ids.filter((id) => !pool.has(id));
    if (missing.length === 0) options.push({ roleIds: ids });
    else if (missing.length < ids.length) incompleteBundles.push({ roleIds: ids, missing });
  }
  for (const id of sortRoleIds(roleIds)) {
    if (!inBundle.has(id)) options.push({ roleIds: [id] });
  }
  return { options, incompleteBundles };
}

/** Number of characters all options together add, i.e. the most any pools can get. */
export function totalRoles(options: { roleIds: string[] }[]) {
  return options.reduce((n, o) => n + o.roleIds.length, 0);
}
