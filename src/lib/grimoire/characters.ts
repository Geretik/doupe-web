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
  /** Tokens that only ever lie at the character's own player: "No ability" of a used ability, the Scarlet Woman's "Demon" */
  selfTokens: string[];
};

/**
 * Reminder tokens the grimoire understands: one that makes its player drunk or poisoned (their information may
 * be false), the "Wrong" player of a Washerwoman, Librarian or Investigator, "No ability" of a used ability,
 * the Demon's "Dead" (its attack) and the Monk's, Innkeeper's or Tea Lady's protection.
 */
export type TokenKind = "poisoned" | "drunk" | "wrong" | "noAbility" | "dead" | "protected";

function tokenKind(en: string): TokenKind | null {
  if (en === "Poisoned") return "poisoned";
  if (/^Drunk( \d)?$/.test(en)) return "drunk";
  if (en === "Wrong") return "wrong";
  if (en === "No ability") return "noAbility";
  if (en === "Dead") return "dead";
  if (en === "Protected" || en === "Can not die") return "protected";
  return null;
}

/** Tokens besides "No ability" that only lie at the character's own player, by their English text */
const SELF_TOKENS: Record<string, string[]> = { scarletwoman: ["Demon"] };

type CharacterData = Pick<GrimoireCharacter, "firstNight" | "otherNight" | "setup"> & { en: CharacterTexts; cs: CharacterTexts };
type CharacterTexts = Pick<GrimoireCharacter, "ability" | "firstNightReminder" | "otherNightReminder" | "reminders" | "remindersGlobal">;

/** Every character of lib/botc-roles in the page's language; the grimoire page hands it to the browser. */
export function grimoireCharacters(locale: Locale): Record<string, GrimoireCharacter> {
  const characters = data as Record<string, CharacterData>;
  return Object.fromEntries(
    Object.entries(characters).map(([id, c]) => {
      const tokenKinds: Record<string, TokenKind> = {};
      const selfTokens = new Set<string>();
      c.en.reminders.forEach((en, i) => {
        const kind = tokenKind(en);
        const text = c[locale].reminders[i];
        if (kind && text) tokenKinds[text] = kind;
        if (text && (kind === "noAbility" || SELF_TOKENS[id]?.includes(en))) selfTokens.add(text);
      });
      return [
        id,
        { firstNight: c.firstNight, otherNight: c.otherNight, setup: c.setup, ...c[locale], once: /once per game/i.test(c.en.ability), tokenKinds, selfTokens: [...selfTokens] },
      ];
    }),
  );
}
