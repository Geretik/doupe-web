// `npm run botc-data [path]`: copies what the grimoire needs about each character – ability, night order with
// the Storyteller's texts, reminder tokens – from the club's script tool (github.com/Geretik/boardgames,
// apps/botc/src/data) into src/data/botc-characters.json, in English and Czech. Run it after the script tool's
// data changes; the new file goes live with the next deploy. Only characters the site knows (lib/botc-roles)
// are copied, so no Fabled or Loric.
// Path: the boardgames repo (default ../boardgames next to this repo).
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { botcRoles } from "../src/lib/botc-roles.ts";

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

const texts = (r) => ({
  ability: r.ability ?? "",
  firstNightReminder: r.firstNightReminder ?? "",
  otherNightReminder: r.otherNightReminder ?? "",
  reminders: r.reminders ?? [],
  remindersGlobal: r.remindersGlobal ?? [],
});

const characters = {};
const missing = [];
for (const { id } of botcRoles) {
  const en = english.get(id);
  if (!en) {
    missing.push(id);
    continue;
  }
  const base = texts(en);
  // a Czech text the script tool has not translated yet stays English
  const cs = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, czech[id]?.[k] ?? v]));
  characters[id] = { firstNight: en.firstNight ?? 0, otherNight: en.otherNight ?? 0, setup: Boolean(en.setup), en: base, cs };
}
if (missing.length) {
  console.error(`Ve script toolu chybí postavy: ${missing.join(", ")}`);
  process.exit(1);
}

writeFileSync(FILE, `${JSON.stringify(characters, null, 1)}\n`);
console.log(`Uloženo ${Object.keys(characters).length} postav do src/data/botc-characters.json.`);
