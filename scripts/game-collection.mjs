// `npm run hry`: reads the club's game collection from Zatrolené hry into src/data/game-collection.json,
// which the games page (/hry) shows, and the other names of each game (the original title of a Czech edition…)
// into src/data/game-names.json, which the lending page uses to find a game named in English. Run it on your own
// computer after editing the list there: their Cloudflare turns away requests from servers (Vercel, GitHub Actions),
// so the site cannot read it itself. The new list goes live with the next deploy (commit and push).
import { readFileSync, writeFileSync } from "node:fs";
import { CLUB_COLLECTION_URL, parseAltNames, parseClubCollection } from "../src/lib/zatrolene.ts";

const FILE = new URL("../src/data/game-collection.json", import.meta.url);
const NAMES_FILE = new URL("../src/data/game-names.json", import.meta.url);
/** Between two pages of games, to go easy on their site */
const PAUSE_MS = 1500;

async function get(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "DoUPe-Olomouc/1.0 (+https://www.doupeol.cz/hry)" },
    signal: AbortSignal.timeout(30_000),
  });
  const html = await res.text();
  if (!res.ok) {
    // e.g. "HTTP 403 (cloudflare, challenge, Just a moment...)"
    const title = html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim();
    const details = [res.headers.get("server"), res.headers.get("cf-mitigated"), title].filter(Boolean).join(", ");
    throw new Error(`HTTP ${res.status}${details ? ` (${details})` : ""}`);
  }
  return html;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

let html;
try {
  html = await get(CLUB_COLLECTION_URL);
} catch (e) {
  console.error(`Zatrolené hry odmítly stránku klubu: ${e.message}`);
  process.exit(1);
}
// throws when the page is not what we expect, so a broken read never replaces a good list
const games = parseClubCollection(html);
let changes = false;

const before = readJson(FILE)?.games ?? [];
const line = (g) => JSON.stringify(g);
if (games.length === before.length && games.every((g, i) => line(g) === line(before[i]))) {
  console.log(`Načteno ${games.length} her, seznam beze změny.`);
} else {
  changes = true;
  // one game per line, so the git diff shows what changed
  const updatedAt = new Date().toISOString();
  writeFileSync(FILE, `{\n  "updatedAt": "${updatedAt}",\n  "games": [\n${games.map((g) => `    ${line(g)}`).join(",\n")}\n  ]\n}\n`);

  const key = (g) => `${g.id} ${g.name}`;
  const old = new Map(before.map((g) => [key(g), g]));
  const now = new Set(games.map(key));
  const added = games.filter((g) => !old.has(key(g)));
  const removed = before.filter((g) => !now.has(key(g)));
  const changed = games.filter((g) => old.has(key(g)) && line(old.get(key(g))) !== line(g));
  console.log(`Načteno ${games.length} her (předtím ${before.length}).`);
  for (const g of added) console.log(`  + ${g.name}`);
  for (const g of removed) console.log(`  − ${g.name}`);
  for (const g of changed) console.log(`  ~ ${g.name}`);
}

// The other names: one page per game, so only of games read for the first time (a game's names hardly change).
const knownNames = readJson(NAMES_FILE)?.names ?? {};
const names = Object.fromEntries(games.filter((g) => knownNames[g.id]).map((g) => [g.id, knownNames[g.id]]));
const writeNames = () =>
  writeFileSync(
    NAMES_FILE,
    `{\n  "names": {\n${games
      .filter((g) => names[g.id])
      .map((g) => `    "${g.id}": ${JSON.stringify(names[g.id])}`)
      .join(",\n")}\n  }\n}\n`,
  );
const missing = games.filter((g) => !names[g.id]);
if (Object.keys(names).length !== Object.keys(knownNames).length) {
  changes = true;
  writeNames();
}
if (missing.length) {
  console.log(`Další názvy her: čtu stránky ${missing.length} her (asi ${Math.ceil((missing.length * PAUSE_MS) / 60_000)} min)…`);
  let read = 0;
  for (const g of missing) {
    try {
      if (read) await new Promise((r) => setTimeout(r, PAUSE_MS));
      names[g.id] = parseAltNames(await get(g.url), g.id);
    } catch (e) {
      console.error(`  ${g.name}: ${e.message} – zbytek příště (spusť znovu).`);
      break;
    }
    read++;
    // saved as it goes: a stopped run keeps what it read
    writeNames();
    if (read % 25 === 0) console.log(`  ${read} z ${missing.length}`);
  }
  if (read) changes = true;
  console.log(`Další názvy her: přečteno ${read} z ${missing.length}.`);
}

console.log(changes ? "Na web se dostane s dalším nasazením (commit a push)." : "Není co nasazovat.");
