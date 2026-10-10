import data from "@/data/homebrew-characters.json";
import { findRole, findStorytellerRole, homebrewCollections, homebrewRoles, homebrewStorytellerRoles, isHomebrew } from "./botc-roles";
import { toGrimoireCharacter, type CharacterTexts, type GrimoireCharacter } from "./grimoire/characters";

/*
 * What the server knows about each homebrew character beyond its name (botc-roles homebrewRoles): its ability, night
 * order with the Storyteller's texts, reminder tokens and jinxes, the wiki's art – read by scripts/homebrew.mjs from
 * the BotC HomeBrew Wiki. Far too much for the browser (over a thousand characters), so only the server reads it:
 * the grimoire gets the characters it needs, a script for the script tool gets them in full.
 */

type HomebrewData = CharacterTexts & {
  firstNight: number;
  otherNight: number;
  setup: boolean;
  jinxes?: { id: string; reason: string }[];
  flavor?: string;
  special?: unknown[];
  image?: string;
};

const characters = data as Record<string, HomebrewData>;

/** The grimoire's data of those of these characters that are homebrew; their texts are English in both languages. */
export function homebrewGrimoireCharacters(ids: Iterable<string | null | undefined>): Record<string, GrimoireCharacter> {
  const out: Record<string, GrimoireCharacter> = {};
  for (const id of ids) {
    const c = id && isHomebrew(id) ? characters[id] : undefined;
    if (id && c && !out[id]) out[id] = toGrimoireCharacter(id, c, c, c);
  }
  return out;
}

/**
 * A homebrew character as a script's entry in the official format, in full – the script tool, the official app and
 * clocktower.online know only the official characters by their id.
 */
export function homebrewScriptEntry(id: string) {
  const c = isHomebrew(id) ? characters[id] : undefined;
  const role = findRole(id) ?? findStorytellerRole(id);
  if (!c || !role) return null;
  return {
    id,
    name: role.en,
    team: role.team,
    ability: c.ability,
    ...(c.image ? { image: c.image } : {}),
    ...(c.flavor ? { flavor: c.flavor } : {}),
    firstNight: c.firstNight,
    firstNightReminder: c.firstNightReminder,
    otherNight: c.otherNight,
    otherNightReminder: c.otherNightReminder,
    reminders: c.reminders,
    ...(c.remindersGlobal.length ? { remindersGlobal: c.remindersGlobal } : {}),
    setup: c.setup,
    ...(c.jinxes?.length ? { jinxes: c.jinxes } : {}),
    ...(c.special?.length ? { special: c.special } : {}),
  };
}

/** A script in the official format with every homebrew character written out in full (one given by its id only). */
export function withHomebrewInFull(script: unknown[]): unknown[] {
  return script.map((item) => {
    const id = typeof item === "string" ? item : item && typeof item === "object" && "id" in item && typeof item.id === "string" ? item.id : null;
    const full = id && isHomebrew(id) ? homebrewScriptEntry(id) : null;
    // an entry that has its own data (a script from the wiki) keeps it
    return full && (typeof item === "string" || !("ability" in (item as object))) ? full : item;
  });
}

/** A homebrew character's ability and whether it changes the setup, for the catalogue of the collections */
export function homebrewAbility(id: string) {
  const c = isHomebrew(id) ? characters[id] : undefined;
  return c ? { ability: c.ability, setup: c.setup } : null;
}

/** A homebrew collection as a script in the official format: every character in full, the players' first. */
export function homebrewCollectionScript(key: string): unknown[] | null {
  const collection = homebrewCollections.find((c) => c.key === key);
  if (!collection) return null;
  const ids = [...homebrewRoles, ...homebrewStorytellerRoles].filter((r) => r.collection === key).map((r) => r.id);
  return [{ id: "_meta", name: collection.name, ...(collection.author ? { author: collection.author } : {}) }, ...ids.flatMap((id) => homebrewScriptEntry(id) ?? [])];
}
