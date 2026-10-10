// `npm run homebrew`: reads the homebrew characters of the collections below from the BotC HomeBrew Wiki
// (botchomebrew.wiki, the JSON each collection page offers for download) into
// - src/data/homebrew-roles.json: the list every page knows (id, team, name, collection; small, in the browser too),
// - src/data/homebrew-characters.json: what the grimoire and the script tool need (ability, night order with the
//   Storyteller's texts, reminder tokens, jinxes, the original art), read on the server only,
// - public/botc/roles/hb/<id>.webp: the icon, the wiki's art cropped and shrunk to 64 px like the official ones
//   (only the missing ones are fetched, so a new run downloads just the new characters).
// Run it on your own computer after editing COLLECTIONS: the wiki sits behind Cloudflare, which may turn away
// requests from servers. The characters go live with the next deploy (commit and push).
//
// A character's id is `<collection key>_<its id on the wiki>` (letters and digits only): different collections
// have different characters of the same name (three Ronins), and an official id never has "_". Ids are stored in
// game records and grimoires, so a collection's key never changes once it is in use.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const WIKI = "https://botchomebrew.wiki";
const ROLES_FILE = new URL("../src/data/homebrew-roles.json", import.meta.url);
const CHARACTERS_FILE = new URL("../src/data/homebrew-characters.json", import.meta.url);
const ICONS = new URL("../public/botc/roles/hb/", import.meta.url);
/** Between two requests to the wiki, to go easy on it */
const PAUSE_MS = 400;
const ICON_SIZE = 64;
/** Room in the grimoire's checks (grimoire/schema roleId) */
const MAX_ID = 40;

/**
 * The collections, in the order the site lists them. `key`: the start of their characters' ids – letters only,
 * never changed once used. `slug`: the collection's address on the wiki. `name`: when the wiki's is decorated.
 * Chosen 2026-10-10: the club's three (Luis, Odyssey, The Menagerie) and the wiki's curated collections.
 */
const COLLECTIONS = [
  { key: "luis", slug: "homebrews-by-luis", name: "Homebrews by Luis" },
  { key: "odyssey", slug: "odyssey" },
  { key: "menagerie", slug: "the-menagerie" },
  { key: "tirfar", slug: "tales-from-tir-fars-archive" },
  { key: "potato", slug: "the-potato-patch" },
  { key: "oblivion", slug: "oblivion-theatre" },
  { key: "darkartist", slug: "and-dark-forgot-how-how-finish-this-joke-darkartist", name: "And... Dark Forgot How How Finish this Joke" },
  { key: "mistfits", slug: "the-mistfits" },
  { key: "brewulation", slug: "brewulation-and-boilers" },
  { key: "anthology", slug: "the-bootlegger-s-anthology" },
  { key: "astra", slug: "astra" },
  { key: "circus", slug: "circus-music" },
  { key: "manors", slug: "of-manors-mayhem" },
  { key: "pandora", slug: "pandora-s-box", name: "Pandora's Box" },
  { key: "templefair", slug: "Festival of Lanterns — Temple Fair", name: "Festival of Lanterns: Temple Fair" },
  { key: "storm", slug: "Festival of Lanterns — The Storm Is Coming", name: "Festival of Lanterns: The Storm Is Coming" },
  { key: "starlight", slug: "Travel by Starlight", name: "Travel by Starlight" },
  { key: "academy", slug: "The Academy" },
  { key: "cog", slug: "cog-in-the-machine" },
  { key: "megalomania", slug: "megalomania" },
  { key: "bazaar", slug: "the-bazaar" },
  { key: "arcanum", slug: "the-arcanum" },
  { key: "ravenswood", slug: "Ravenswood Chronicle" },
  { key: "contest", slug: "homebrew-contest-winners" },
];

const TEAMS = ["townsfolk", "outsider", "minion", "demon", "traveller", "fabled", "loric"];
/** The official characters (`npm run botc-data`), whose ids a homebrew one never gets */
const official = new Set(Object.keys(JSON.parse(readFileSync(new URL("../src/data/botc-characters.json", import.meta.url), "utf8"))));

async function get(url, as = "json") {
  await new Promise((r) => setTimeout(r, PAUSE_MS));
  const res = await fetch(url, {
    headers: { "user-agent": "DoUPe-Olomouc/1.0 (+https://www.doupeol.cz/botc)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${[res.headers.get("server"), res.headers.get("cf-mitigated")].filter(Boolean).join(", ")}`);
  return as === "json" ? res.json() : Buffer.from(await res.arrayBuffer());
}

const key = (text) =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Same as `abilityHash` in modules/botc/lib/botc-roles.ts (FNV-1a, so the browser can compute it): tells apart characters of the same id and name */
function abilityHash(ability) {
  let h = 0x811c9dc5;
  for (const ch of key(ability)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(36);
}

/**
 * The wiki's texts mark reminder tokens for its own pages: ":reminder:" (an icon), *TOKEN* or **TOKEN**.
 * The grimoire shows plain text.
 */
const plain = (text) =>
  String(text ?? "")
    .replace(/:reminder:/g, "")
    .replace(/\*+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ([.,:;!?])/g, "$1")
    .trim();

const strings = (list) => (Array.isArray(list) ? list.map(plain).filter(Boolean) : []);
const night = (n) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);
const firstImage = (image) => (Array.isArray(image) ? image[0] : image) || null;

const collections = [];
const roles = [];
const characters = {};
const icons = [];

for (const c of COLLECTIONS) {
  const url = `${WIKI}/collection/${encodeURIComponent(c.slug)}`;
  let data;
  try {
    data = await get(`${WIKI}/api/page-json?type=collection&slug=${encodeURIComponent(c.slug)}`);
  } catch (e) {
    console.error(`${c.slug}: ${e.message}`);
    process.exit(1);
  }
  const meta = data.find((d) => d?.id === "_meta") ?? {};
  collections.push({ key: c.key, name: c.name ?? meta.name ?? c.slug, author: meta.author || null, url });

  const items = data.filter((d) => d && typeof d === "object" && typeof d.id === "string" && d.id !== "_meta");
  // the character's id in this collection → ours, for its jinxes
  const ours = new Map();
  const taken = new Set(roles.map((r) => r.id));
  const kept = [];
  for (const item of items) {
    const team = item.team === "traveler" ? "traveller" : item.team;
    if (!TEAMS.includes(team) || !item.name) {
      console.warn(`${c.key}: vynechávám ${item.id} (tým ${item.team})`);
      continue;
    }
    let id = `${c.key}_${key(item.id) || key(item.name)}`.slice(0, MAX_ID);
    // the same id twice in one collection (Astra's two Treasure Hunters)
    for (let n = 2; taken.has(id) || official.has(id); n++) id = `${`${c.key}_${key(item.id)}`.slice(0, MAX_ID - 2)}${n}`;
    taken.add(id);
    if (!ours.has(item.id)) ours.set(item.id, id);
    kept.push({ item, id, team });
  }

  for (const { item, id, team } of kept) {
    const ability = plain(item.ability);
    roles.push({ id, team, en: plain(item.name), c: c.key, src: item.id, h: abilityHash(ability) });
    const jinxes = (Array.isArray(item.jinxes) ? item.jinxes : [])
      .map((j) => ({ id: official.has(j?.id) ? j.id : ours.get(j?.id), reason: plain(j?.reason) }))
      .filter((j) => j.id && j.reason);
    const image = firstImage(item.image);
    characters[id] = {
      firstNight: night(item.firstNight),
      otherNight: night(item.otherNight),
      setup: Boolean(item.setup),
      ability,
      firstNightReminder: plain(item.firstNightReminder),
      otherNightReminder: plain(item.otherNightReminder),
      reminders: strings(item.reminders),
      remindersGlobal: strings(item.remindersGlobal),
      ...(jinxes.length ? { jinxes } : {}),
      ...(item.flavor ? { flavor: plain(item.flavor) } : {}),
      ...(Array.isArray(item.special) && item.special.length ? { special: item.special } : {}),
      ...(image ? { image } : {}),
    };
    if (image) icons.push({ id, image });
  }
  console.log(`${collections.at(-1).name}: ${kept.length} postav`);
}

/** The wiki's own small version of its art (`assets/art/x.png` → `assets/thumb/x.png.webp`), else the art itself */
function iconSources(image) {
  const art = image.match(/^https:\/\/botchomebrew\.wiki\/assets\/art\/([^/?#]+)/);
  return art ? [`${WIKI}/assets/thumb/${art[1]}.webp`, image] : [image];
}

mkdirSync(ICONS, { recursive: true });
/** For a character without art (botc-roles NO_ICON): a plain token */
const PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="28" fill="#8a7f6e" fill-opacity="0.25" stroke="#8a7f6e" stroke-width="3"/><circle cx="32" cy="32" r="7" fill="#8a7f6e"/></svg>`;
const placeholder = new URL("_.webp", ICONS);
if (!existsSync(placeholder)) writeFileSync(placeholder, await sharp(Buffer.from(PLACEHOLDER)).webp({ quality: 82 }).toBuffer());
const failed = [];
let fetched = 0;
for (const { id, image } of icons) {
  const file = new URL(`${id}.webp`, ICONS);
  if (existsSync(file)) continue;
  let done = false;
  for (const src of iconSources(image)) {
    try {
      const icon = await sharp(await get(src, "buffer"))
        .trim()
        .resize(ICON_SIZE, ICON_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 82 })
        .toBuffer();
      writeFileSync(file, icon);
      done = true;
      fetched++;
      break;
    } catch {
      // the next source
    }
  }
  if (!done) failed.push(id);
}
console.log(`Staženo ${fetched} nových ikon.`);
if (failed.length) console.warn(`Bez ikony (zkus znovu později): ${failed.join(", ")}`);

// `noIcon`: the site shows the team's colour instead (a later run may still get it)
for (const r of roles) if (!existsSync(new URL(`${r.id}.webp`, ICONS))) r.noIcon = true;
// one character per line, so a new run shows in git as the lines that changed
const lines = (list) => list.map((x) => JSON.stringify(x)).join(",\n");
writeFileSync(ROLES_FILE, `{"collections":[\n${lines(collections)}\n],"roles":[\n${lines(roles)}\n]}\n`);
writeFileSync(CHARACTERS_FILE, `${JSON.stringify(characters, null, 1)}\n`);
console.log(`Uloženo ${roles.length} postav ze ${collections.length} kolekcí.`);
