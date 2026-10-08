import type { PlaylistTrack } from "@/db/schema";

type Link = PlaylistTrack["links"][number];
type Cell = { text: string; links: Link[] };

const WEB_LINK = /^https?:\/\//i;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Bare URLs and markdown links `[label](url)` inside a cell of a table pasted as text. */
function cellFromText(raw: string): Cell {
  const links: Link[] = [];
  let text = raw.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi, (_, label: string, url: string) => {
    links.push({ label: clean(label), url });
    return label;
  });
  text = text.replace(/https?:\/\/[^\s|]+/gi, (url) => {
    links.push({ label: "", url });
    return "";
  });
  return { text: clean(text), links };
}

/** Rows of a table copied from a document, a spreadsheet, a web page or a chat (the HTML keeps the links). */
function cellsFromHtml(html: string): Cell[][] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("tr")].map((tr) =>
    [...tr.querySelectorAll("th, td")].map((td) => ({
      text: clean(td.textContent ?? ""),
      links: [...td.querySelectorAll("a[href]")]
        .map((a) => ({ label: clean(a.textContent ?? ""), url: a.getAttribute("href")?.trim() ?? "" }))
        .filter((l) => WEB_LINK.test(l.url)),
    })),
  );
}

/** Rows of a table pasted as text: tab-separated (spreadsheet, document) or a markdown table (chat). */
function cellsFromText(text: string): Cell[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() && !/^[\s|:-]+$/.test(line)) // markdown separator row "|---|---|"
    .map((line) => {
      const cells = line.includes("\t") ? line.split("\t") : line.trim().replace(/^\||\|$/g, "").split("|");
      return cells.map(cellFromText);
    });
}

const HEADERS: [keyof Columns, RegExp][] = [
  ["title", /^(skladba|název|nazev|píseň|track|title|song|name)$/i],
  ["author", /^(autor|author|artist|interpret|umělec)$/i],
  ["license", /^(licence|license|licen[cs]e)$/i],
  ["download", /^(stažení|stazeni|ke stažení|download|odkaz|odkazy|link|links|zdroj|source)$/i],
];
type Columns = { title: number; author: number; license: number; download: number };

/** Turns table rows into tracks: columns by the header when there is one, else # / song / author / licence / download. */
function tracksFromCells(rows: Cell[][]): PlaylistTrack[] {
  rows = rows.filter((r) => r.some((c) => c.text || c.links.length));
  let cols: Columns = { title: -1, author: -1, license: -1, download: -1 };
  const header = rows[0]?.map((c) => HEADERS.find(([, re]) => re.test(c.text))?.[0]);
  if (header?.includes("title")) {
    header.forEach((key, i) => {
      if (key && cols[key] < 0) cols[key] = i;
    });
    rows = rows.slice(1);
  } else {
    // a first column with just the order number is skipped
    const numbered = rows.length > 0 && rows.every((r) => /^\d+\.?$/.test(r[0]?.text ?? ""));
    const o = numbered ? 1 : 0;
    cols = { title: o, author: o + 1, license: o + 2, download: o + 3 };
  }
  return rows.flatMap((r) => {
    const text = (i: number) => (i >= 0 ? r[i]?.text ?? "" : "");
    const title = text(cols.title);
    if (!title) return [];
    // the download column's links; when it has none, links anywhere in the row (e.g. a linked song name)
    const own = cols.download >= 0 ? r[cols.download]?.links ?? [] : [];
    const links = (own.length ? own : r.flatMap((c) => c.links)).slice(0, 5);
    // one link: its label is the whole download cell ("MP3 / WAV ke stažení"); several: their own labels
    const downloadText = text(cols.download);
    return [
      {
        title: title.slice(0, 200),
        author: text(cols.author).slice(0, 200) || null,
        license: text(cols.license).slice(0, 100) || null,
        links: links.map((l) => ({ url: l.url, label: (links.length === 1 && downloadText ? downloadText : l.label).slice(0, 100) })),
      },
    ];
  });
}

/** Tracks from what was pasted; the HTML version is used when it holds a table (it keeps the links). */
export function playlistFromPaste(html: string, text: string): PlaylistTrack[] {
  const fromHtml = html ? tracksFromCells(cellsFromHtml(html)) : [];
  return fromHtml.length ? fromHtml : tracksFromCells(cellsFromText(text));
}
