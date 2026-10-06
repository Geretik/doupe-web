import { desc } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers, games, sessions, type ScriptLink } from "@/db/schema";
import { libraryScriptLinks } from "./scripts";

/** Values used before, offered in the session form so organisers pick instead of typing. Most recent first. */
export type FormSuggestions = {
  places: string[];
  storytellers: string[];
  /** Scripts of the library (with a link to the script tool), then from earlier sessions and recorded games; picking a name fills in its link */
  scripts: ScriptLink[];
};

const norm = (s: string) => s.trim().toLowerCase();

/** Drops empty values and repeats that differ only in case or spaces, keeping the first spelling */
function unique(values: (string | null)[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const k = v ? norm(v) : "";
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v!.trim());
  }
  return out;
}

export async function getFormSuggestions(): Promise<FormSuggestions> {
  const [library, recent, played, organisers] = await Promise.all([
    libraryScriptLinks(),
    db
      .select({ place: sessions.place, storyteller: sessions.storyteller, scripts: sessions.scripts })
      .from(sessions)
      .orderBy(desc(sessions.startsAt))
      .limit(300),
    db
      .select({ name: games.scriptName, url: games.scriptUrl })
      .from(games)
      .orderBy(desc(games.createdAt))
      .limit(300),
    db.select({ nickname: adminUsers.nickname }).from(adminUsers).orderBy(adminUsers.nickname),
  ]);

  // one entry per script name; the library's link comes first, otherwise a link from any earlier use is kept
  const scripts = new Map<string, ScriptLink>();
  for (const s of [...library, ...recent.flatMap((r) => r.scripts), ...played]) {
    const name = s.name.trim();
    const url = s.url?.trim() ?? "";
    const k = norm(name);
    if (!k) continue;
    const known = scripts.get(k);
    if (!known) scripts.set(k, { name, url });
    else if (!known.url && url) known.url = url;
  }

  return {
    places: unique(recent.map((r) => r.place)).slice(0, 30),
    storytellers: unique([
      ...recent.map((r) => r.storyteller),
      ...organisers.map((r) => r.nickname),
    ]).slice(0, 50),
    scripts: [...scripts.values()].slice(0, 100 + library.length),
  };
}
