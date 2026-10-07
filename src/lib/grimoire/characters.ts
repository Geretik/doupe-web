import data from "@/data/botc-characters.json";
import type { Locale } from "@/i18n/dictionaries";

/**
 * What the grimoire needs about a character in one language: its ability, when it wakes (the script tool's
 * night order: 0 = not on that night) with the Storyteller's text, and its reminder tokens. The data comes
 * from the club's script tool, see scripts/botc-data.mjs.
 */
export type GrimoireCharacter = {
  firstNight: number;
  otherNight: number;
  /** Changes the setup, e.g. the Baron's [+2 Outsiders] */
  setup: boolean;
  ability: string;
  firstNightReminder: string;
  otherNightReminder: string;
  reminders: string[];
  /** Tokens put on another character's player, e.g. the Drunk's "Is the Drunk" */
  remindersGlobal: string[];
};

type CharacterData = Omit<GrimoireCharacter, keyof CharacterTexts> & { en: CharacterTexts; cs: CharacterTexts };
type CharacterTexts = Pick<GrimoireCharacter, "ability" | "firstNightReminder" | "otherNightReminder" | "reminders" | "remindersGlobal">;

/** Every character of lib/botc-roles in the page's language; the grimoire page hands it to the browser. */
export function grimoireCharacters(locale: Locale): Record<string, GrimoireCharacter> {
  const characters = data as Record<string, CharacterData>;
  return Object.fromEntries(
    Object.entries(characters).map(([id, c]) => [id, { firstNight: c.firstNight, otherNight: c.otherNight, setup: c.setup, ...c[locale] }]),
  );
}
