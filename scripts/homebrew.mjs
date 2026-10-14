// `npm run homebrew`: reads the homebrew characters of the collections below from the BotC HomeBrew Wiki
// (botchomebrew.wiki, the JSON each collection page offers for download) into
// - src/data/homebrew-roles.json: the list every page knows (id, team, name, collection; small, in the browser too),
// - src/data/homebrew-characters.json: what the grimoire and the script tool need (ability, night order with the
//   Storyteller's texts, reminder tokens, jinxes, the original art), read on the server only,
// - public/botc/roles/hb/<id>.webp: the icon, the wiki's art cropped and shrunk to 64 px like the official ones
//   (only the missing ones are fetched, so a new run downloads just the new characters).
// The Czech translations are not read from the wiki: src/data/homebrew-cs.json is kept by hand (name, ability, the
// Storyteller's texts, reminder tokens in the English order; `h` = abilityHash of the English ability translated).
// This run copies the Czech names into homebrew-roles.json and says which characters have none or an outdated one
// (the site shows those in English, see modules/botc/lib/homebrew.ts), and which ones the wiki changed otherwise since
// the last run (night texts, tokens, punctuation), for their translation to be checked.
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
 * Chosen 2026-10-10: the club's three (Luis, Odyssey, The Menagerie) and the wiki's curated collections;
 * the rest of the wiki's collections added 2026-10-14 (from `cute` on, alphabetically).
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
  { key: "cute", slug: "a-cute-collection-of-characters" },
  { key: "kerfuffle", slug: "a-right-proper-kerfuffle" },
  { key: "coda", slug: "coda-s-comprehension-collection" },
  { key: "conduct", slug: "conduc-t", name: "conDUC!T" },
  { key: "faketier", slug: "faketier-s-collection" },
  { key: "forgetful", slug: "forgetful-brewing" },
  { key: "trouble", slug: "imppreposterous" },
  { key: "syncret", slug: "imppreposterous-syncretastrophy" },
  { key: "casa", slug: "la-casa-de-proker10ias-proker10ias", name: "La Casa de Proker10ias" },
  { key: "midsummer", slug: "midsummer-nights-dream" },
  { key: "chamber", slug: "my-chamber" },
  { key: "earth", slug: "out-of-this-earth" },
  { key: "principia", slug: "principia-horologia" },
  { key: "ratspath", slug: "rat-s-path-to-judgement-day" },
  { key: "sleepless", slug: "sleepless-nights-sunless-daze" },
  { key: "conference", slug: "the-conference" },
  { key: "evergreen", slug: "the-evergreen-hollow" },
  { key: "faewilds", slug: "the-faewilds" },
  { key: "forge", slug: "the-forge-nerdguy708" },
  { key: "garden", slug: "the-garden-centre-0rig0nal" },
  { key: "genderbent", slug: "the-gender-bent" },
  { key: "kinky", slug: "the-kinky-collection" },
  { key: "mint", slug: "the-mint-collection" },
  { key: "secondvisit", slug: "the-second-visit" },
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

const SETUP_TEAMS = { outsider: "outsider", outsiders: "outsider", minion: "minion", minions: "minion", demon: "demon", demons: "demon" };

/**
 * How a character's "[+1 Outsider]" changes the numbers of the setup, as grimoire/state's SETUP_EFFECTS has it for
 * the official ones (`setup` in homebrew-roles.json). Only the plain parts of the bracket count: "+1 Outsider",
 * "-1 or +1 Outsider", "-1 to +1 Outsiders", "+1 Minion", "No Outsiders", "Any number of Outsiders" or "-? to +?
 * Outsiders", several of
 * them ("-1 Minion, +1 Outsider"); the rest ("+the Pixie", "X Outsiders", "1 Townsfolk is evil") is left to the
 * Storyteller, who sees the whole bracket in the grimoire.
 */
function setupEffect(ability) {
  const bracket = ability.match(/\[([^\]]+)\]/)?.[1];
  if (!bracket) return undefined;
  let options = [{}];
  const none = new Set();
  const open = new Set();
  for (const part of bracket.split(/[,.;]/).map((p) => p.trim())) {
    let m;
    if ((m = part.match(/^no (outsiders?|minions?|demons?)(?: in play)?$/i))) none.add(SETUP_TEAMS[m[1].toLowerCase()]);
    else if ((m = part.match(/^(?:any (?:number of )?|[+-]?\? to [+-]?\? )(outsiders?|minions?|demons?)$/i))) open.add(SETUP_TEAMS[m[1].toLowerCase()]);
    else if ((m = part.match(/^([+-]\d+)(?: (or|to) ([+-]?\d+))? (outsiders?|minions?|demons?)$/i))) {
      const team = SETUP_TEAMS[m[4].toLowerCase()];
      const a = Number(m[1]);
      // "+1 to 2": the second number has the first one's sign
      const b = m[3] === undefined ? a : Number(/^[+-]/.test(m[3]) ? m[3] : `${m[1][0]}${m[3]}`);
      const values =
        m[2]?.toLowerCase() === "to" ? Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => Math.min(a, b) + i) : [...new Set([a, b])];
      options = options.flatMap((o) => values.map((v) => ({ ...o, [team]: (o[team] ?? 0) + v })));
    }
  }
  const effect = {
    ...(options.some((o) => Object.values(o).some(Boolean)) ? { options } : {}),
    ...(none.size ? { none: [...none] } : {}),
    ...(open.size ? { open: [...open] } : {}),
  };
  return Object.keys(effect).length ? effect : undefined;
}

/**
 * Whether the drunkenness or poison a character causes lasts until the next dusk, as the Poisoner's does
 * (grimoire/state takes its tokens off at dusk; `dusk` in homebrew-roles.json): every sentence of its ability that
 * makes someone drunk or poisoned does it "until dusk" at night – the sentence says so ("Each night, choose a
 * player: they are poisoned until dusk."), or the one before it does and this one says nothing of a day ("Each
 * night, choose 2 players. If neither are Townsfolk, one is drunk until dusk"). Not by day ("If you are executed,
 * … poisoned until dusk" means the next day's), not "until dusk tomorrow", not when another sentence poisons for
 * longer: those tokens the Storyteller takes off.
 */
function untilDusk(ability) {
  const sentences = ability.split(/(?<=[.;])\s+/);
  const atNight = (s) => /\b(?:night|tonight)\b/i.test(s ?? "");
  const byDay = (s) => /\b(?:day|today|execut\w*|nominat\w*|vot\w*)\b/i.test(s);
  const causing = sentences.flatMap((s, i) => (/\b(?:poison|poisons|poisoned|drunk)\b/i.test(s) ? [i] : []));
  return (
    causing.length > 0 &&
    causing.every((i) => {
      const s = sentences[i];
      return (
        /\b(?:poison|poisons|poisoned|drunk)\b[^.;]*\buntil dusk\b/i.test(s) &&
        !/\buntil dusk tomorrow\b|\btomorrow dusk\b/i.test(s) &&
        (atNight(s) || (atNight(sentences[i - 1]) && !byDay(s)))
      );
    })
  );
}

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
    const setup = item.setup ? setupEffect(ability) : undefined;
    roles.push({
      id,
      team,
      en: plain(item.name),
      c: c.key,
      src: item.id,
      h: abilityHash(ability),
      ...(setup ? { setup } : {}),
      ...(untilDusk(ability) ? { dusk: true } : {}),
    });
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

const CZECH_FILE = new URL("../src/data/homebrew-cs.json", import.meta.url);
const czech = existsSync(CZECH_FILE) ? JSON.parse(readFileSync(CZECH_FILE, "utf8")) : {};
// the texts as the last run saved them: what the wiki changed since then without touching the ability's words
const previous = existsSync(CHARACTERS_FILE) ? JSON.parse(readFileSync(CHARACTERS_FILE, "utf8")) : {};
const TRANSLATED = ["ability", "firstNightReminder", "otherNightReminder", "reminders", "remindersGlobal"];
const untranslated = [];
const outdated = [];
const changed = [];
for (const r of roles) {
  const cs = czech[r.id];
  const en = characters[r.id];
  if (!cs) untranslated.push(r.id);
  // the site shows English for these (modules/botc/lib/homebrew.ts)
  else if (cs.h !== r.h || cs.reminders.length !== en.reminders.length || cs.remindersGlobal.length !== en.remindersGlobal.length) outdated.push(r.id);
  else if (previous[r.id] && TRANSLATED.some((f) => JSON.stringify(previous[r.id][f]) !== JSON.stringify(en[f]))) changed.push(r.id);
  if (cs?.name) r.cs = cs.name;
}
if (untranslated.length) console.warn(`Bez českého překladu (${untranslated.length}): ${untranslated.join(", ")}`);
if (outdated.length) console.warn(`Schopnost nebo počet žetonů se na wiki změnil, český překlad je zastaralý (${outdated.length}): ${outdated.join(", ")}`);
// said only by this run: the next one compares with what this one saves
if (changed.length) console.warn(`Texty pro vypravěče, žetony nebo interpunkce se na wiki změnily, zkontroluj český překlad (${changed.length}, git diff homebrew-characters.json): ${changed.join(", ")}`);
// one character per line, so a new run shows in git as the lines that changed
const lines = (list) => list.map((x) => JSON.stringify(x)).join(",\n");
writeFileSync(ROLES_FILE, `{"collections":[\n${lines(collections)}\n],"roles":[\n${lines(roles)}\n]}\n`);
writeFileSync(CHARACTERS_FILE, `${JSON.stringify(characters, null, 1)}\n`);
console.log(`Uloženo ${roles.length} postav ze ${collections.length} kolekcí.`);
