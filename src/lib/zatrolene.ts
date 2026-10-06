/**
 * The club's game collection is kept on Zatrolené hry (the Czech board game database). Their API only
 * looks up single games, so we read the club's public page instead: one request, every game on it.
 * Their Cloudflare turns away requests from servers (Vercel, GitHub Actions), so `npm run hry`
 * (scripts/game-collection.mjs) reads it from an organiser's computer into src/data/game-collection.json.
 * No imports, so that script and the e2e tests can run the parser on its own.
 */

export const ZATROLENE_URL = "https://www.zatrolene-hry.cz";

/** The club's page there */
export const CLUB_COLLECTION_URL = `${ZATROLENE_URL}/klub/klub-deskovych-her-doupe-olomouc-58/`;

/** Krvavá hodina odbila (Blood on the Clocktower), which has its own section of our site. */
export const BOTC_ZATROLENE_ID = 12158;

export type CollectionGame = {
  /** The game's id on Zatrolené hry */
  id: number;
  name: string;
  year: number | null;
  /** Link to the game's page on Zatrolené hry */
  url: string;
  expansion: boolean;
  /** 0 when not known */
  minPlayers: number;
  maxPlayers: number;
  /** The club's note: who owns a private game, where it is stored, the language edition… */
  note: string | null;
};

/** The page is not what we expect (it moved or changed): needs a fix on our side, unlike a network hiccup. */
export class PageChangedError extends Error {}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Only known entities: names on the page may contain a bare "&". */
function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function text(html: string) {
  return decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""));
}

function attr(block: string, name: string) {
  return block.match(new RegExp(`${name}="([^"]*)"`))?.[1];
}

function int(s: string | undefined) {
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/**
 * Games from the club's page in its order. Throws when the page does not look as expected (Zatrolené hry
 * changed it, or the list is paged), so a broken parse never replaces a good list.
 */
export function parseClubCollection(html: string): CollectionGame[] {
  const games = html
    .split(/<div class="row list-item\b/)
    .slice(1)
    .map((block): CollectionGame => {
      const head = block.match(/<h3[^>]*>\s*<a href="([^"]*-(\d+))\/?"[^>]*>([\s\S]*?)<\/a>\s*(?:\((-?\d{1,4})\))?/);
      if (!head) throw new PageChangedError("A game without its name and link");
      const [, path, id, name, year] = head;
      const noteHtml = block.match(/<div class="card-body">([\s\S]*?)<\/div>/)?.[1];
      // lines of a note are separate remarks ("Uskladněno u Kryštofa" / "anglická verze")
      const note = noteHtml && text(noteHtml).split("\n").map((l) => l.trim()).filter(Boolean).join("; ");
      return {
        id: Number(id),
        name: text(name).trim(),
        year: year ? Number(year) : null,
        url: new URL(decode(path), ZATROLENE_URL).toString(),
        expansion: attr(block, "data-game-type") === "expansion",
        minPlayers: int(attr(block, "data-min-players")),
        maxPlayers: int(attr(block, "data-max-players")),
        note: note || null,
      };
    });
  if (games.length === 0) throw new PageChangedError("No games found on the page");
  // the heading says how many games the collection has: a paged or half-read list must not pass
  const total = html.match(/<h3[^>]*>\s*Sbírka her \((\d+)\)/)?.[1];
  if (!total) throw new PageChangedError("The heading with the number of games is missing");
  if (Number(total) !== games.length) throw new PageChangedError(`The page lists ${games.length} of ${total} games`);
  return games;
}

/** A private game of a member ("soukromá hra (Krápník)"), not one the club owns. */
export function isPrivateGame(g: CollectionGame) {
  return /^soukromá hra\b/i.test(g.note ?? "");
}
