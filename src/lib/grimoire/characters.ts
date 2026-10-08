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
  /** The script tool's jinxes with other characters (by their id): how the two work together, in English */
  jinxes: Record<string, string>;
};

/**
 * Reminder tokens the grimoire understands: one that makes its player drunk or poisoned (their information may
 * be false), the "Wrong" player of a Washerwoman, Librarian or Investigator, "No ability" of a used ability,
 * the Demon's "Dead" (its attack) and the Monk's, Innkeeper's or Tea Lady's protection; the Shabaloth's and
 * Professor's "Alive" (brought back), the Fang Gu's "Once" (it jumped), the Vigormortis's "Has ability" (a
 * Minion it killed), the Po's "3 attacks" (it chose nobody), the Al-Hadikhia's "Chose death" and "Chose life",
 * Lil' Monsta's "Is the Demon" (its babysitter), the Leviathan's "Good player executed", the Mezepheles's
 * "Turns evil" and the Witch's "Cursed".
 */
export type TokenKind =
  | "poisoned"
  | "drunk"
  | "wrong"
  | "noAbility"
  | "dead"
  | "protected"
  | "alive"
  | "once"
  | "hasAbility"
  | "charged"
  | "choseDeath"
  | "choseLife"
  | "babysitter"
  | "goodExecuted"
  | "turnsEvil"
  | "cursed";

function tokenKind(en: string): TokenKind | null {
  if (en === "Poisoned") return "poisoned";
  if (/^Drunk( \d)?$/.test(en)) return "drunk";
  if (en === "Wrong") return "wrong";
  if (en === "No ability") return "noAbility";
  if (en === "Dead") return "dead";
  if (en === "Protected" || en === "Can not die") return "protected";
  if (en === "Alive") return "alive";
  if (en === "Once") return "once";
  if (en === "Has ability") return "hasAbility";
  if (en === "3 attacks") return "charged";
  if (en === "Chose death") return "choseDeath";
  if (en === "Chose life") return "choseLife";
  if (en === "Is the Demon") return "babysitter";
  if (en === "Good player executed") return "goodExecuted";
  if (en === "Turns evil") return "turnsEvil";
  if (en === "Cursed") return "cursed";
  return null;
}

/** Tokens besides "No ability" that only lie at the character's own player, by their English text */
const SELF_TOKENS: Record<string, string[]> = { scarletwoman: ["Demon"], po: ["3 attacks"], organgrinder: ["Drunk"] };

type CharacterData = Pick<GrimoireCharacter, "firstNight" | "otherNight" | "setup"> & {
  en: CharacterTexts;
  cs: CharacterTexts;
  jinxes?: { id: string; reason: string }[];
};
type CharacterTexts = Pick<GrimoireCharacter, "ability" | "firstNightReminder" | "otherNightReminder" | "reminders" | "remindersGlobal">;

/** Pairs of these characters with a jinx between them (listed by either of the two), each once, with the reason. */
export function jinxesAmong(roleIds: (string | null)[], characters: Record<string, GrimoireCharacter>) {
  const ids = [...new Set(roleIds.filter((id): id is string => !!id))];
  return ids.flatMap((a, i) =>
    ids.slice(i + 1).flatMap((b) => {
      const reason = characters[a]?.jinxes[b] ?? characters[b]?.jinxes[a];
      return reason ? [{ a, b, reason }] : [];
    }),
  );
}

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
      // Lil' Monsta's tokens are all global: "Is the Demon" at its babysitter, its "Dead"
      c.en.remindersGlobal.forEach((en, i) => {
        const kind = tokenKind(en);
        const text = c[locale].remindersGlobal[i];
        if (kind && text) tokenKinds[text] = kind;
      });
      return [
        id,
        {
          firstNight: c.firstNight,
          otherNight: c.otherNight,
          setup: c.setup,
          ...c[locale],
          once: /once per game/i.test(c.en.ability),
          tokenKinds,
          selfTokens: [...selfTokens],
          jinxes: Object.fromEntries((c.jinxes ?? []).map((j) => [j.id, j.reason])),
        },
      ];
    }),
  );
}
