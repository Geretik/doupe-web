import { gzipSync } from "node:zlib";
import type { DraftScript } from "@/db/schema";
import { scriptToolUrl } from "../site";

/*
 * A draft's script in the official script format: [{ id: "_meta", name, author }, "washerwoman", …]. The club's
 * script tool (BoardGames) opens it from its address – `?script=` with the JSON gzipped and base64-encoded, the
 * way the tool writes it itself (pako's gzip and Node's are the same format) – to print, translate and show
 * the night order. What may be in the script is decided here, on save (lib/draft/service saveScript).
 */

export function scriptJson(script: Pick<DraftScript, "name" | "author" | "roleIds">) {
  return [{ id: "_meta", name: script.name, ...(script.author ? { author: script.author } : {}) }, ...script.roleIds];
}

export function scriptToolLink(script: Pick<DraftScript, "name" | "author" | "roleIds">) {
  return scriptToolLinkForJson(scriptJson(script));
}

/** The script tool opening any script in the official format, e.g. one from the club's library (lib/scripts). */
export function scriptToolLinkForJson(json: unknown[]) {
  const encoded = gzipSync(Buffer.from(JSON.stringify(json), "utf8")).toString("base64");
  return `${scriptToolUrl()}/?${new URLSearchParams({ script: encoded })}`;
}

/** A file name for the downloaded JSON: the script's name without characters file systems dislike. */
export function scriptFileName(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 _-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return `${base || "script"}.json`;
}
