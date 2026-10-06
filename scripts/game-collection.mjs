// `npm run hry`: reads the club's game collection from Zatrolené hry into src/data/game-collection.json,
// which the games page (/hry) shows. Run it on your own computer after editing the list there: their
// Cloudflare turns away requests from servers (Vercel, GitHub Actions), so the site cannot read it itself.
// The new list goes live with the next deploy (commit and push).
import { readFileSync, writeFileSync } from "node:fs";
import { CLUB_COLLECTION_URL, parseClubCollection } from "../src/lib/zatrolene.ts";

const FILE = new URL("../src/data/game-collection.json", import.meta.url);

const res = await fetch(CLUB_COLLECTION_URL, {
  headers: { "user-agent": "DoUPe-Olomouc/1.0 (+https://www.doupeol.cz/hry)" },
  signal: AbortSignal.timeout(30_000),
});
const html = await res.text();
if (!res.ok) {
  // e.g. "HTTP 403 (cloudflare, challenge, Just a moment...)"
  const title = html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim();
  const details = [res.headers.get("server"), res.headers.get("cf-mitigated"), title].filter(Boolean).join(", ");
  console.error(`Zatrolené hry odmítly stránku klubu: HTTP ${res.status}${details ? ` (${details})` : ""}`);
  process.exit(1);
}
// throws when the page is not what we expect, so a broken read never replaces a good list
const games = parseClubCollection(html);

let before = [];
try {
  before = JSON.parse(readFileSync(FILE, "utf8")).games;
} catch {}
const line = (g) => JSON.stringify(g);
if (games.length === before.length && games.every((g, i) => line(g) === line(before[i]))) {
  console.log(`Načteno ${games.length} her, beze změny – není co nasazovat.`);
  process.exit(0);
}

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
console.log("Na web se dostane s dalším nasazením (commit a push).");
