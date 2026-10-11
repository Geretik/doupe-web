import data from "@/data/homebrew-characters.json";
import czechData from "@/data/homebrew-cs.json";
import type { Locale } from "@/i18n/dictionaries";
import {
  abilityHash,
  findRole,
  findStorytellerRole,
  homebrewCollections,
  homebrewRoles,
  homebrewStorytellerRoles,
  isHomebrew,
  matchHomebrew,
  roleName,
} from "./botc-roles";
import { toGrimoireCharacter, type CharacterTexts, type GrimoireCharacter } from "./grimoire/characters";

/*
 * What the server knows about each homebrew character beyond its name (botc-roles homebrewRoles): its ability, night
 * order with the Storyteller's texts, reminder tokens and jinxes, the wiki's art – read by scripts/homebrew.mjs from
 * the BotC HomeBrew Wiki – and their Czech translation (src/data/homebrew-cs.json, kept by hand). Far too much for
 * the browser (over a thousand characters), so only the server reads it: the grimoire gets the characters it needs,
 * a script for the script tool gets them in full.
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

/** `h`: abilityHash of the English ability it was translated from; the reminder tokens in the English order */
type Czech = CharacterTexts & { name: string; h: string };

const characters = data as Record<string, HomebrewData>;
const czech = czechData as Record<string, Czech>;

/**
 * A homebrew character's texts in this language: Czech where translated – unless its author changed the ability on
 * the wiki since, then the English one stays right (`npm run homebrew` lists those) – else English.
 */
function textsIn(id: string, locale: Locale): CharacterTexts {
  const c = characters[id];
  const cs = locale === "cs" ? czech[id] : undefined;
  return cs && cs.h === abilityHash(c.ability) && cs.reminders.length === c.reminders.length && cs.remindersGlobal.length === c.remindersGlobal.length
    ? cs
    : c;
}

/** The grimoire's data of those of these characters that are homebrew, in the page's language. */
export function homebrewGrimoireCharacters(ids: Iterable<string | null | undefined>, locale: Locale): Record<string, GrimoireCharacter> {
  const out: Record<string, GrimoireCharacter> = {};
  for (const id of ids) {
    const c = id && isHomebrew(id) ? characters[id] : undefined;
    if (id && c && !out[id]) out[id] = toGrimoireCharacter(id, c, c, textsIn(id, locale));
  }
  return out;
}

/**
 * A homebrew character as a script's entry in the official format, in full – the script tool, the official app and
 * clocktower.online know only the official characters by their id. In Czech by default: the club plays in Czech
 * and the script tool prints these texts as they are, whatever its language.
 */
export function homebrewScriptEntry(id: string, locale: Locale = "cs") {
  const c = isHomebrew(id) ? characters[id] : undefined;
  const role = findRole(id) ?? findStorytellerRole(id);
  if (!c || !role) return null;
  const texts = textsIn(id, locale);
  return {
    id,
    name: roleName(role, locale),
    team: role.team,
    ability: texts.ability,
    ...(c.image ? { image: c.image } : {}),
    ...(c.flavor ? { flavor: c.flavor } : {}),
    firstNight: c.firstNight,
    firstNightReminder: texts.firstNightReminder,
    otherNight: c.otherNight,
    otherNightReminder: texts.otherNightReminder,
    reminders: texts.reminders,
    ...(texts.remindersGlobal.length ? { remindersGlobal: texts.remindersGlobal } : {}),
    setup: c.setup,
    ...(c.jinxes?.length ? { jinxes: c.jinxes } : {}),
    ...(c.special?.length ? { special: c.special } : {}),
  };
}

/**
 * A script in the official format with every homebrew character of the site's collections written out in full
 * (homebrewScriptEntry): one given by its id only, and one of a script from the wiki, whose English entry gives way
 * to the site's in the chosen language.
 */
export function withHomebrewInFull(script: unknown[], locale: Locale = "cs"): unknown[] {
  return script.map((item) => {
    const meta = item && typeof item === "object" && (item as { id?: unknown }).id === "_meta";
    const id = meta ? null : matchHomebrew(item);
    return (id && homebrewScriptEntry(id, locale)) ?? item;
  });
}

/** Every homebrew character's ability in this language, for picking characters in the script builder */
export function homebrewAbilities(locale: Locale): Record<string, string> {
  return Object.fromEntries(Object.keys(characters).map((id) => [id, textsIn(id, locale).ability]));
}

/** A homebrew character's ability in this language and whether it changes the setup, for the catalogue of the collections */
export function homebrewAbility(id: string, locale: Locale) {
  return isHomebrew(id) ? { ability: textsIn(id, locale).ability, setup: characters[id].setup } : null;
}

/** A homebrew collection as a script in the official format: every character in full, the players' first. */
export function homebrewCollectionScript(key: string, locale: Locale = "cs"): unknown[] | null {
  const collection = homebrewCollections.find((c) => c.key === key);
  if (!collection) return null;
  const ids = [...homebrewRoles, ...homebrewStorytellerRoles].filter((r) => r.collection === key).map((r) => r.id);
  return [
    { id: "_meta", name: collection.name, ...(collection.author ? { author: collection.author } : {}) },
    ...ids.flatMap((id) => homebrewScriptEntry(id, locale) ?? []),
  ];
}
