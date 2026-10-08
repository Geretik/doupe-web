// `npm run botc-data [path]`: copies what the grimoire needs about each character – ability, night order with
// the Storyteller's texts, reminder tokens, jinxes – from the club's script tool (github.com/Geretik/boardgames,
// apps/botc/src/data) into src/data/botc-characters.json, in English and Czech. Run it after the script tool's
// data changes; the new file goes live with the next deploy. Only characters the site knows (modules/botc/lib/botc-roles:
// the players' and the Storyteller's Fabled and Loric) are copied.
// Path: the boardgames repo (default ../boardgames next to this repo).
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { botcRoles, storytellerRoles } from "../src/modules/botc/lib/botc-roles.ts";

const repo = resolve(process.argv[2] ?? join(import.meta.dirname, "../../boardgames"));
const dataDir = join(repo, "apps/botc/src/data");
const FILE = new URL("../src/data/botc-characters.json", import.meta.url);

/** The data files are plain literals (`export const x: Type = [...] satisfies Type[]`); read the first one without a TS compiler. */
function readLiteral(file) {
  const code = readFileSync(join(dataDir, file), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/^export default .*$/gm, "")
    .replace(/export const \w+(?::[^=]+)? =/, "return ")
    .replace(/\b(?:satisfies [\w<>[\], ]+|as const)(?=\s*;?\s*$)/gm, "");
  return new Function(code)();
}

const english = new Map(readLiteral("roles.en.ts").map((r) => [r.id, r]));
const czech = readLiteral("roles.cs.overrides.ts");
const all = [...botcRoles, ...storytellerRoles];
const known = new Set(all.map((r) => r.id));

/**
 * Reminder tokens the script tool lacks: the Storm Catcher marks the player of the character it named
 * ("mark that player as STORMCAUGHT"), as in the official grimoire.
 */
const MISSING_REMINDERS = { stormcatcher: { en: ["Stormcaught"], cs: ["Chycen bouří"] } };

/**
 * Jinxes by the character listing them: the other character and the reason, in English only – the script tool's
 * Czech ones are partly of older jinxes (Spy & Damsel: "Only 1 jinxed character…") or of a pair the other way round.
 */
const jinxes = new Map(
  readLiteral("jinxes.en.ts").map((j) => [j.id, j.hatred.filter((h) => known.has(h.id)).map((h) => ({ id: h.id, reason: h.reason }))]),
);

const texts = (r, extra = []) => ({
  ability: r.ability ?? "",
  firstNightReminder: r.firstNightReminder ?? "",
  otherNightReminder: r.otherNightReminder ?? "",
  reminders: [...(r.reminders ?? []), ...extra],
  remindersGlobal: r.remindersGlobal ?? [],
});

const characters = {};
const missing = [];
for (const { id } of all) {
  const en = english.get(id);
  if (!en) {
    missing.push(id);
    continue;
  }
  const base = texts(en, MISSING_REMINDERS[id]?.en);
  // a Czech text the script tool has not translated yet stays English
  const cs = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, czech[id]?.[k] ?? v]));
  // the added token in Czech too, unless the script tool translates the reminders itself
  if (MISSING_REMINDERS[id] && !czech[id]?.reminders) cs.reminders = [...(en.reminders ?? []), ...MISSING_REMINDERS[id].cs];
  const jinxed = jinxes.get(id) ?? [];
  characters[id] = { firstNight: en.firstNight ?? 0, otherNight: en.otherNight ?? 0, setup: Boolean(en.setup), en: base, cs, ...(jinxed.length ? { jinxes: jinxed } : {}) };
}
if (missing.length) {
  console.error(`Ve script toolu chybí postavy: ${missing.join(", ")}`);
  process.exit(1);
}

writeFileSync(FILE, `${JSON.stringify(characters, null, 1)}\n`);
console.log(`Uloženo ${Object.keys(characters).length} postav do src/data/botc-characters.json.`);
