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
  /** "Once per game" (the Slayer, the Artist, the Wizard…): the player can be marked as having used it */
  once: boolean;
  /** What some reminder tokens mean, by their text in this language (found by the English one) */
  tokenKinds: Record<string, TokenKind>;
};

/**
 * Reminder tokens the grimoire understands: one that makes its player drunk or poisoned (their information may
 * be false), the "Wrong" player of a Washerwoman, Librarian or Investigator, and "No ability" of a used ability.
 */
export type TokenKind = "poisoned" | "drunk" | "wrong" | "noAbility";

function tokenKind(en: string): TokenKind | null {
  if (en === "Poisoned") return "poisoned";
  if (/^Drunk( \d)?$/.test(en)) return "drunk";
  if (en === "Wrong") return "wrong";
  if (en === "No ability") return "noAbility";
  return null;
}

type CharacterData = Pick<GrimoireCharacter, "firstNight" | "otherNight" | "setup"> & { en: CharacterTexts; cs: CharacterTexts };
type CharacterTexts = Pick<GrimoireCharacter, "ability" | "firstNightReminder" | "otherNightReminder" | "reminders" | "remindersGlobal">;

/** Every character of lib/botc-roles in the page's language; the grimoire page hands it to the browser. */
export function grimoireCharacters(locale: Locale): Record<string, GrimoireCharacter> {
  const characters = data as Record<string, CharacterData>;
  return Object.fromEntries(
    Object.entries(characters).map(([id, c]) => {
      const tokenKinds: Record<string, TokenKind> = {};
      c.en.reminders.forEach((en, i) => {
        const kind = tokenKind(en);
        const text = c[locale].reminders[i];
        if (kind && text) tokenKinds[text] = kind;
      });
      return [id, { firstNight: c.firstNight, otherNight: c.otherNight, setup: c.setup, ...c[locale], once: /once per game/i.test(c.en.ability), tokenKinds }];
    }),
  );
}
