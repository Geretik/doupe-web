import type { Locale } from "@/i18n/dictionaries";
// a relative path, not "@/data": scripts/botc-data.mjs reads this module in plain Node
import homebrew from "../../../data/homebrew-roles.json" with { type: "json" };

/**
 * Characters a player can have in a game – no Fabled or Loric, those belong to the Storyteller (storytellerRoles).
 * Ids as in the official script tool; Czech names from the club's script tool (boardgames, roles.cs.overrides.ts).
 * Icons: public/botc/roles/<id>.webp, the official character icons from wiki.bloodontheclocktower.com that the
 * club's script tool shows too (© The Pandemonium Institute), cropped and shrunk to 64 px.
 */
export const roleTeams = ["townsfolk", "outsider", "minion", "demon", "traveller"] as const;
export type RoleTeam = (typeof roleTeams)[number];
export type RoleEdition = "tb" | "bmr" | "snv" | "carousel";
/** `collection`: the homebrew collection of a homebrew character (see homebrewRoles), whose edition is "homebrew" */
export type BotcRole = { id: string; team: RoleTeam; edition: RoleEdition | "homebrew"; en: string; cs: string; collection?: string };

/** Sorted by team, then by the Czech name */
export const botcRoles: readonly BotcRole[] = [
  { id: "acrobat", team: "townsfolk", edition: "carousel", en: "Acrobat", cs: "Akrobat" },
  { id: "alchemist", team: "townsfolk", edition: "carousel", en: "Alchemist", cs: "Alchymista" },
  { id: "alsaahir", team: "townsfolk", edition: "carousel", en: "Alsaahir", cs: "Alsaahir" },
  { id: "amnesiac", team: "townsfolk", edition: "carousel", en: "Amnesiac", cs: "Amnesiak" },
  { id: "atheist", team: "townsfolk", edition: "carousel", en: "Atheist", cs: "Ateista" },
  { id: "grandmother", team: "townsfolk", edition: "bmr", en: "Grandmother", cs: "Babička" },
  { id: "balloonist", team: "townsfolk", edition: "carousel", en: "Balloonist", cs: "Balonář" },
  { id: "tealady", team: "townsfolk", edition: "bmr", en: "Tea Lady", cs: "Čajová dáma" },
  { id: "gossip", team: "townsfolk", edition: "bmr", en: "Gossip", cs: "Drbna" },
  { id: "empath", team: "townsfolk", edition: "tb", en: "Empath", cs: "Empat" },
  { id: "exorcist", team: "townsfolk", edition: "bmr", en: "Exorcist", cs: "Exorcista" },
  { id: "farmer", team: "townsfolk", edition: "carousel", en: "Farmer", cs: "Farmář" },
  { id: "philosopher", team: "townsfolk", edition: "snv", en: "Philosopher", cs: "Filozof" },
  { id: "gambler", team: "townsfolk", edition: "bmr", en: "Gambler", cs: "Gambler" },
  { id: "general", team: "townsfolk", edition: "carousel", en: "General", cs: "Generál" },
  { id: "clockmaker", team: "townsfolk", edition: "snv", en: "Clockmaker", cs: "Hodinář" },
  { id: "innkeeper", team: "townsfolk", edition: "bmr", en: "Innkeeper", cs: "Hostinský" },
  { id: "undertaker", team: "townsfolk", edition: "tb", en: "Undertaker", cs: "Hrobník" },
  { id: "engineer", team: "townsfolk", edition: "carousel", en: "Engineer", cs: "Inženýr" },
  { id: "cannibal", team: "townsfolk", edition: "carousel", en: "Cannibal", cs: "Kanibal" },
  { id: "preacher", team: "townsfolk", edition: "carousel", en: "Preacher", cs: "Kazatel" },
  { id: "juggler", team: "townsfolk", edition: "snv", en: "Juggler", cs: "Kejklíř" },
  { id: "librarian", team: "townsfolk", edition: "tb", en: "Librarian", cs: "Knihovník" },
  { id: "chambermaid", team: "townsfolk", edition: "bmr", en: "Chambermaid", cs: "Komorná" },
  { id: "magician", team: "townsfolk", edition: "carousel", en: "Magician", cs: "Kouzelník" },
  { id: "king", team: "townsfolk", edition: "carousel", en: "King", cs: "Král" },
  { id: "chef", team: "townsfolk", edition: "tb", en: "Chef", cs: "Kuchař" },
  { id: "flowergirl", team: "townsfolk", edition: "snv", en: "Flowergirl", cs: "Květinářka" },
  { id: "courtier", team: "townsfolk", edition: "bmr", en: "Courtier", cs: "Lichotník" },
  { id: "huntsman", team: "townsfolk", edition: "carousel", en: "Huntsman", cs: "Lovec" },
  { id: "bountyhunter", team: "townsfolk", edition: "carousel", en: "Bounty Hunter", cs: "Lovec odměn" },
  { id: "poppygrower", team: "townsfolk", edition: "carousel", en: "Poppy Grower", cs: "Maková panenka" },
  { id: "mathematician", team: "townsfolk", edition: "snv", en: "Mathematician", cs: "Matematik" },
  { id: "towncrier", team: "townsfolk", edition: "snv", en: "Town Crier", cs: "Městský vyvolávač" },
  { id: "monk", team: "townsfolk", edition: "tb", en: "Monk", cs: "Mnich" },
  { id: "sage", team: "townsfolk", edition: "snv", en: "Sage", cs: "Mudrc" },
  { id: "sailor", team: "townsfolk", edition: "bmr", en: "Sailor", cs: "Námořník" },
  { id: "nightwatchman", team: "townsfolk", edition: "carousel", en: "Nightwatchman", cs: "Noční hlídka" },
  { id: "pacifist", team: "townsfolk", edition: "bmr", en: "Pacifist", cs: "Pacifista" },
  { id: "virgin", team: "townsfolk", edition: "tb", en: "Virgin", cs: "Panna" },
  { id: "minstrel", team: "townsfolk", edition: "bmr", en: "Minstrel", cs: "Pěvec" },
  { id: "washerwoman", team: "townsfolk", edition: "tb", en: "Washerwoman", cs: "Pradlena" },
  { id: "princess", team: "townsfolk", edition: "carousel", en: "Princess", cs: "Princezna" },
  { id: "professor", team: "townsfolk", edition: "bmr", en: "Professor", cs: "Profesor" },
  { id: "fisherman", team: "townsfolk", edition: "carousel", en: "Fisherman", cs: "Rybář" },
  { id: "knight", team: "townsfolk", edition: "carousel", en: "Knight", cs: "Rytíř" },
  { id: "shugenja", team: "townsfolk", edition: "carousel", en: "Shugenja", cs: "Shugenja" },
  { id: "banshee", team: "townsfolk", edition: "carousel", en: "Banshee", cs: "Smrtonoška" },
  { id: "dreamer", team: "townsfolk", edition: "snv", en: "Dreamer", cs: "Snílek" },
  { id: "mayor", team: "townsfolk", edition: "tb", en: "Mayor", cs: "Starosta" },
  { id: "steward", team: "townsfolk", edition: "carousel", en: "Steward", cs: "Steward" },
  { id: "ravenkeeper", team: "townsfolk", edition: "tb", en: "Ravenkeeper", cs: "Strážkyně krkavců" },
  { id: "fool", team: "townsfolk", edition: "bmr", en: "Fool", cs: "Šašek" },
  { id: "noble", team: "townsfolk", edition: "carousel", en: "Noble", cs: "Šlechtic" },
  { id: "seamstress", team: "townsfolk", edition: "snv", en: "Seamstress", cs: "Švadlena" },
  { id: "savant", team: "townsfolk", edition: "snv", en: "Savant", cs: "Učenec" },
  { id: "artist", team: "townsfolk", edition: "snv", en: "Artist", cs: "Umělec" },
  { id: "fortuneteller", team: "townsfolk", edition: "tb", en: "Fortune Teller", cs: "Vědma" },
  { id: "highpriestess", team: "townsfolk", edition: "carousel", en: "High Priestess", cs: "Velekněžka" },
  { id: "villageidiot", team: "townsfolk", edition: "carousel", en: "Village Idiot", cs: "Vesnický pobuda" },
  { id: "oracle", team: "townsfolk", edition: "snv", en: "Oracle", cs: "Věštec" },
  { id: "pixie", team: "townsfolk", edition: "carousel", en: "Pixie", cs: "Víla" },
  { id: "lycanthrope", team: "townsfolk", edition: "carousel", en: "Lycanthrope", cs: "Vlkodlak" },
  { id: "soldier", team: "townsfolk", edition: "tb", en: "Soldier", cs: "Voják" },
  { id: "cultleader", team: "townsfolk", edition: "carousel", en: "Cult Leader", cs: "Vůdce sekty" },
  { id: "investigator", team: "townsfolk", edition: "tb", en: "Investigator", cs: "Vyšetřovatel" },
  { id: "slayer", team: "townsfolk", edition: "tb", en: "Slayer", cs: "Zabiják" },
  { id: "snakecharmer", team: "townsfolk", edition: "snv", en: "Snake Charmer", cs: "Zaklínač hadů" },
  { id: "choirboy", team: "townsfolk", edition: "carousel", en: "Choirboy", cs: "Zpěváček" },
  { id: "lunatic", team: "outsider", edition: "bmr", en: "Lunatic", cs: "Blázen" },
  { id: "moonchild", team: "outsider", edition: "bmr", en: "Moonchild", cs: "Dítě měsíce" },
  { id: "tinker", team: "outsider", edition: "bmr", en: "Tinker", cs: "Dráteník" },
  { id: "zealot", team: "outsider", edition: "carousel", en: "Zealot", cs: "Fanatik" },
  { id: "golem", team: "outsider", edition: "carousel", en: "Golem", cs: "Golem" },
  { id: "puzzlemaster", team: "outsider", edition: "carousel", en: "Puzzlemaster", cs: "Hádankář" },
  { id: "heretic", team: "outsider", edition: "carousel", en: "Heretic", cs: "Heretik" },
  { id: "goon", team: "outsider", edition: "bmr", en: "Goon", cs: "Hňup" },
  { id: "barber", team: "outsider", edition: "snv", en: "Barber", cs: "Holič" },
  { id: "hatter", team: "outsider", edition: "carousel", en: "Hatter", cs: "Kloboučník" },
  { id: "damsel", team: "outsider", edition: "carousel", en: "Damsel", cs: "Kráska" },
  { id: "plaguedoctor", team: "outsider", edition: "carousel", en: "Plague Doctor", cs: "Morový doktor" },
  { id: "mutant", team: "outsider", edition: "snv", en: "Mutant", cs: "Mutant" },
  { id: "klutz", team: "outsider", edition: "snv", en: "Klutz", cs: "Nešika" },
  { id: "drunk", team: "outsider", edition: "tb", en: "Drunk", cs: "Opilec" },
  { id: "politician", team: "outsider", edition: "carousel", en: "Politician", cs: "Politician" },
  { id: "hermit", team: "outsider", edition: "carousel", en: "Hermit", cs: "Poustevník" },
  { id: "snitch", team: "outsider", edition: "carousel", en: "Snitch", cs: "Práskač" },
  { id: "recluse", team: "outsider", edition: "tb", en: "Recluse", cs: "Samotář" },
  { id: "butler", team: "outsider", edition: "tb", en: "Butler", cs: "Sluha" },
  { id: "saint", team: "outsider", edition: "tb", en: "Saint", cs: "Světec" },
  { id: "sweetheart", team: "outsider", edition: "snv", en: "Sweetheart", cs: "Zlatíčko" },
  { id: "ogre", team: "outsider", edition: "carousel", en: "Ogre", cs: "Zlobr" },
  { id: "baron", team: "minion", edition: "tb", en: "Baron", cs: "Baron" },
  { id: "boffin", team: "minion", edition: "carousel", en: "Boffin", cs: "Boffin" },
  { id: "boomdandy", team: "minion", edition: "carousel", en: "Boomdandy", cs: "Boomdandy" },
  { id: "cerenovus", team: "minion", edition: "snv", en: "Cerenovus", cs: "Cerenovus" },
  { id: "organgrinder", team: "minion", edition: "carousel", en: "Organ Grinder", cs: "Cvičitel opic" },
  { id: "wizard", team: "minion", edition: "carousel", en: "Wizard", cs: "Čaroděj" },
  { id: "witch", team: "minion", edition: "snv", en: "Witch", cs: "Čarodějnice" },
  { id: "devilsadvocate", team: "minion", edition: "bmr", en: "Devil's Advocate", cs: "Ďáblův advokát" },
  { id: "harpy", team: "minion", edition: "carousel", en: "Harpy", cs: "Harpyje" },
  { id: "pithag", team: "minion", edition: "snv", en: "Pit-Hag", cs: "Ježibaba" },
  { id: "godfather", team: "minion", edition: "bmr", en: "Godfather", cs: "Kmotr" },
  { id: "marionette", team: "minion", edition: "carousel", en: "Marionette", cs: "Marioneta" },
  { id: "mezepheles", team: "minion", edition: "carousel", en: "Mezepheles", cs: "Mezefeles" },
  { id: "assassin", team: "minion", edition: "bmr", en: "Assassin", cs: "Nájemný vrah" },
  { id: "wraith", team: "minion", edition: "carousel", en: "Wraith", cs: "Přízrak" },
  { id: "psychopath", team: "minion", edition: "carousel", en: "Psychopath", cs: "Psychopat" },
  { id: "goblin", team: "minion", edition: "carousel", en: "Goblin", cs: "Skřet" },
  { id: "fearmonger", team: "minion", edition: "carousel", en: "Fearmonger", cs: "Strachotvůrce" },
  { id: "mastermind", team: "minion", edition: "bmr", en: "Mastermind", cs: "Strůjce" },
  { id: "scarletwoman", team: "minion", edition: "tb", en: "Scarlet Woman", cs: "Šarlatová žena" },
  { id: "spy", team: "minion", edition: "tb", en: "Spy", cs: "Špeh" },
  { id: "poisoner", team: "minion", edition: "tb", en: "Poisoner", cs: "Travič" },
  { id: "widow", team: "minion", edition: "carousel", en: "Widow", cs: "Vdova" },
  { id: "vizier", team: "minion", edition: "carousel", en: "Vizier", cs: "Vizír" },
  { id: "summoner", team: "minion", edition: "carousel", en: "Summoner", cs: "Vyvolávač" },
  { id: "xaan", team: "minion", edition: "carousel", en: "Xaan", cs: "Xaan" },
  { id: "eviltwin", team: "minion", edition: "snv", en: "Evil Twin", cs: "Zlé dvojče" },
  { id: "alhadikhia", team: "demon", edition: "carousel", en: "Al-Hadikhia", cs: "Al-Hadichia" },
  { id: "yaggababble", team: "demon", edition: "carousel", en: "Yaggababble", cs: "Blabla Jaga" },
  { id: "imp", team: "demon", edition: "tb", en: "Imp", cs: "Čert" },
  { id: "fanggu", team: "demon", edition: "snv", en: "Fang Gu", cs: "Fang Gu" },
  { id: "kazali", team: "demon", edition: "carousel", en: "Kazali", cs: "Kazali" },
  { id: "legion", team: "demon", edition: "carousel", en: "Legion", cs: "Legie" },
  { id: "leviathan", team: "demon", edition: "carousel", en: "Leviathan", cs: "Leviathan" },
  { id: "lilmonsta", team: "demon", edition: "carousel", en: "Lil' Monsta", cs: "Lil' Monsta" },
  { id: "nodashii", team: "demon", edition: "snv", en: "No Dashii", cs: "No Dashii" },
  { id: "ojo", team: "demon", edition: "carousel", en: "Ojo", cs: "Ojo" },
  { id: "lordoftyphon", team: "demon", edition: "carousel", en: "Lord of Typhon", cs: "Pán bouře" },
  { id: "lleech", team: "demon", edition: "carousel", en: "Lleech", cs: "Pijavice" },
  { id: "po", team: "demon", edition: "bmr", en: "Po", cs: "Pó" },
  { id: "pukka", team: "demon", edition: "bmr", en: "Pukka", cs: "Pukka" },
  { id: "riot", team: "demon", edition: "carousel", en: "Riot", cs: "Riot" },
  { id: "shabaloth", team: "demon", edition: "bmr", en: "Shabaloth", cs: "Shabaloth" },
  { id: "vigormortis", team: "demon", edition: "snv", en: "Vigormortis", cs: "Vigormortis" },
  { id: "vortox", team: "demon", edition: "snv", en: "Vortox", cs: "Vortox" },
  { id: "zombuul", team: "demon", edition: "bmr", en: "Zombuul", cs: "Zombuul" },
  { id: "bishop", team: "traveller", edition: "bmr", en: "Bishop", cs: "Biskup" },
  { id: "bureaucrat", team: "traveller", edition: "tb", en: "Bureaucrat", cs: "Byrokrat" },
  { id: "cacklejack", team: "traveller", edition: "carousel", en: "Cacklejack", cs: "Cacklejack" },
  { id: "deviant", team: "traveller", edition: "snv", en: "Deviant", cs: "Deviant" },
  { id: "gangster", team: "traveller", edition: "carousel", en: "Gangster", cs: "Gangster" },
  { id: "gnome", team: "traveller", edition: "carousel", en: "Gnome", cs: "Gnome" },
  { id: "barista", team: "traveller", edition: "snv", en: "Barista", cs: "Kavárník" },
  { id: "matron", team: "traveller", edition: "bmr", en: "Matron", cs: "Matrona" },
  { id: "harlot", team: "traveller", edition: "snv", en: "Harlot", cs: "Nevěstka" },
  { id: "scapegoat", team: "traveller", edition: "tb", en: "Scapegoat", cs: "Obětní beránek" },
  { id: "gunslinger", team: "traveller", edition: "tb", en: "Gunslinger", cs: "Pistolník" },
  { id: "butcher", team: "traveller", edition: "snv", en: "Butcher", cs: "Řezník" },
  { id: "bonecollector", team: "traveller", edition: "snv", en: "Bone Collector", cs: "Sběratel kostí" },
  { id: "judge", team: "traveller", edition: "bmr", en: "Judge", cs: "Soudce" },
  { id: "thief", team: "traveller", edition: "tb", en: "Thief", cs: "Zloděj" },
  { id: "apprentice", team: "traveller", edition: "bmr", en: "Apprentice", cs: "Učedník" },
  { id: "voudon", team: "traveller", edition: "bmr", en: "Voudon", cs: "Vudun" },
  { id: "beggar", team: "traveller", edition: "tb", en: "Beggar", cs: "Žebrák" },
];

/**
 * Homebrew characters: the collections of the BotC HomeBrew Wiki (botchomebrew.wiki) the club chose, read by
 * scripts/homebrew.mjs (`npm run homebrew`). They are characters like the official ones – in the grimoire, game
 * records, drafts and scripts – but no picker lists all of them: a script, a draft's source or a collection
 * names the ones in use. Czech names from src/data/homebrew-cs.json. Their ids are `<collection key>_<id on the wiki>`; an official
 * id never has "_". Abilities and night order: grimoire/homebrew.ts, on the server only.
 */
export type HomebrewCollection = { key: string; name: string; author: string | null; url: string };
/** `cs`: its Czech name (src/data/homebrew-cs.json), `src`: the id on the wiki, `h`: abilityHash of its ability, `noIcon`: the wiki had no art for it */
type HomebrewEntry = { id: string; team: string; en: string; cs?: string; c: string; src: string; h: string; noIcon?: boolean };

export const homebrewCollections: readonly HomebrewCollection[] = homebrew.collections;
const homebrewEntries: readonly HomebrewEntry[] = homebrew.roles;
const homebrewById = new Map(homebrewEntries.map((e) => [e.id, e]));
const collectionByKey = new Map(homebrewCollections.map((c) => [c.key, c]));

const isRoleTeam = (team: string): team is RoleTeam => (roleTeams as readonly string[]).includes(team);

/** The homebrew players' characters (no Fabled or Loric), collection by collection */
export const homebrewRoles: readonly BotcRole[] = homebrewEntries.flatMap((e) =>
  isRoleTeam(e.team) ? [{ id: e.id, team: e.team, edition: "homebrew" as const, en: e.en, cs: e.cs ?? e.en, collection: e.c }] : [],
);

/** The homebrew collection a character is from; undefined for an official one. */
export function homebrewCollectionOf(id: string | null | undefined) {
  const entry = id ? homebrewById.get(id) : undefined;
  return entry ? collectionByKey.get(entry.c) : undefined;
}

export function isHomebrew(id: string | null | undefined) {
  return Boolean(id && homebrewById.has(id));
}

/** Letters and digits of a text, lower case, without diacritics – as scripts/homebrew.mjs compares them */
function plainKey(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** FNV-1a of an ability's letters and digits; the same in scripts/homebrew.mjs */
export function abilityHash(ability: string) {
  let h = 0x811c9dc5;
  for (const ch of plainKey(ability.replace(/:reminder:/g, ""))) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(36);
}

const homebrewBySrc = new Map<string, HomebrewEntry[]>();
const homebrewByName = new Map<string, HomebrewEntry[]>();
for (const e of homebrewEntries) {
  for (const [map, k] of [
    [homebrewBySrc, plainKey(e.src)],
    [homebrewByName, plainKey(e.en)],
  ] as const) {
    if (k) map.set(k, [...(map.get(k) ?? []), e]);
  }
}

/**
 * The homebrew character a script's entry stands for: its id here ("luis_cobbler"), or its id on the wiki or its
 * name – and its ability, when the entry has one: a homebrew of the same name with another ability is another
 * character, and three collections have a Ronin. Null when it is none of them or it is not clear which.
 */
export function matchHomebrew(entry: unknown): string | null {
  const item = typeof entry === "string" ? { id: entry } : entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
  const id = typeof item.id === "string" ? item.id : "";
  if (homebrewById.has(id)) return id;
  const name = typeof item.name === "string" ? plainKey(item.name) : "";
  const candidates = new Set([...(homebrewBySrc.get(plainKey(id)) ?? []), ...(name ? (homebrewByName.get(name) ?? []) : [])]);
  const hash = typeof item.ability === "string" ? abilityHash(item.ability) : null;
  const fitting = [...candidates].filter((e) => hash === null || e.h === hash);
  return fitting.length === 1 ? fitting[0].id : null;
}

/** Value of the game form's character select for a player who did not play that game. */
export const SAT_OUT = "__out";
/** Stored instead of a character for a player who ran the game; no character has this id. */
export const STORYTELLER = "storyteller";

/** Demon bluffs are good characters that are not in play; the Demon usually gets three. */
export const BLUFF_COUNT = 3;
export const bluffTeams: readonly RoleTeam[] = ["townsfolk", "outsider"];

/**
 * Characters tied to a second one, and the teams it can be from: who a Drunk, Lunatic or Marionette
 * thinks they are ("as"), which in-play Townsfolk the Pixie learns ("knows"), whose ability the Philosopher,
 * the Apprentice (a Townsfolk's when good, a Minion's when evil) or the Alchemist (a Minion's) takes, the
 * not-in-play good character whose ability the Boffin gives the Demon ("gives").
 */
export type LinkedKind = "as" | "knows" | "ability" | "gives";
const linkedRoles: Partial<Record<string, { kind: LinkedKind; teams: readonly RoleTeam[] }>> = {
  drunk: { kind: "as", teams: ["townsfolk"] },
  lunatic: { kind: "as", teams: ["demon"] },
  marionette: { kind: "as", teams: ["townsfolk", "outsider"] },
  pixie: { kind: "knows", teams: ["townsfolk"] },
  philosopher: { kind: "ability", teams: ["townsfolk", "outsider"] },
  apprentice: { kind: "ability", teams: ["townsfolk", "minion"] },
  alchemist: { kind: "ability", teams: ["minion"] },
  boffin: { kind: "gives", teams: ["townsfolk", "outsider"] },
};

/** The second character a character is tied to, or undefined when it has none. */
export function linkedRoleOf(roleId: string | null | undefined) {
  return roleId ? linkedRoles[roleId] : undefined;
}

const byId = new Map([...botcRoles, ...homebrewRoles].map((r) => [r.id, r]));

export function findRole(id: string | null | undefined) {
  return id ? byId.get(id) : undefined;
}

export function roleName(role: Pick<BotcRole, "en" | "cs">, locale: Locale) {
  return locale === "en" ? role.en : role.cs;
}

/**
 * The Storyteller's characters, which no player has: the Fabled (the script tool's "Báje") change the game for
 * the players, the Loric its rules. They go in a grimoire, never in game records or drafts. Czech names from the
 * club's script tool, English where it has none; icons as for the players' characters.
 */
export type StorytellerTeam = "fabled" | "loric";
/**
 * A Fabled or Loric. `anyTime`: the Storyteller may add it during the game too (the wiki's How to Run: "At any time,
 * declare that…"); the other Fabled are added at the start of the game, every Loric as well ("All Loric must be added
 * at the start of the game").
 */
export type StorytellerRole = { id: string; team: StorytellerTeam; en: string; cs: string; anyTime?: true; collection?: string };

/** Sorted by team, then by the Czech name */
export const storytellerRoles: readonly StorytellerRole[] = [
  { id: "angel", team: "fabled", en: "Angel", cs: "Anděl" },
  { id: "buddhist", team: "fabled", en: "Buddhist", cs: "Budha" },
  { id: "deusexfiasco", team: "fabled", en: "Deus ex Fiasco", cs: "Deus ex Fiasco" },
  { id: "spiritofivory", team: "fabled", en: "Spirit of Ivory", cs: "Duch slonoviny" },
  { id: "djinn", team: "fabled", en: "Djinn", cs: "Džin" },
  { id: "fiddler", team: "fabled", en: "Fiddler", cs: "Houslista", anyTime: true },
  { id: "toymaker", team: "fabled", en: "Toymaker", cs: "Hračkář" },
  { id: "fibbin", team: "fabled", en: "Fibbin", cs: "Lhář" },
  { id: "hellslibrarian", team: "fabled", en: "Hell's Librarian", cs: "Pekelná knihovnice", anyTime: true },
  { id: "ferryman", team: "fabled", en: "Ferryman", cs: "Převozník", anyTime: true },
  { id: "revolutionary", team: "fabled", en: "Revolutionary", cs: "Revolucionář" },
  { id: "sentinel", team: "fabled", en: "Sentinel", cs: "Strážný" },
  { id: "duchess", team: "fabled", en: "Duchess", cs: "Vévodkyně" },
  { id: "doomsayer", team: "fabled", en: "Doomsayer", cs: "Věštec zkázy", anyTime: true },
  { id: "godofug", team: "loric", en: "God of Ug", cs: "God of Ug" },
  { id: "hindu", team: "loric", en: "Hindu", cs: "Hindu" },
  { id: "knaves", team: "loric", en: "Knaves", cs: "Knaves" },
  { id: "stormcatcher", team: "loric", en: "Storm Catcher", cs: "Lapač bouří" },
  { id: "pope", team: "loric", en: "Pope", cs: "Papež" },
  { id: "bootlegger", team: "loric", en: "Bootlegger", cs: "Pašerák" },
  { id: "tor", team: "loric", en: "Tor", cs: "Tor" },
  { id: "bigwig", team: "loric", en: "Big Wig", cs: "Velké zvíře" },
  { id: "ventriloquist", team: "loric", en: "Ventriloquist", cs: "Ventriloquist" },
  { id: "zenomancer", team: "loric", en: "Zenomancer", cs: "Zenomancer" },
  { id: "gardener", team: "loric", en: "Gardener", cs: "Zahradník" },
];

/** The homebrew Fabled and Loric, collection by collection; none of them is known to be added during the game */
export const homebrewStorytellerRoles: readonly StorytellerRole[] = homebrewEntries.flatMap((e) =>
  e.team === "fabled" || e.team === "loric" ? [{ id: e.id, team: e.team, en: e.en, cs: e.cs ?? e.en, collection: e.c }] : [],
);

const storytellerById = new Map([...storytellerRoles, ...homebrewStorytellerRoles].map((r) => [r.id, r]));

export function findStorytellerRole(id: string | null | undefined) {
  return id ? storytellerById.get(id) : undefined;
}

/** A Storyteller's character from a script entry: its id ("djinn", the official tool's "spirit_of_ivory") or its name. */
export function matchStorytellerId(text: string) {
  const key = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  return storytellerRoles.find((r) => r.id === key || r.en.toLowerCase().replace(/[^a-z0-9]/g, "") === key)?.id ?? null;
}

/** A character's name, a player's or the Storyteller's; the id when it is neither. */
export function characterName(id: string | null | undefined, locale: Locale) {
  const role = findRole(id) ?? findStorytellerRole(id);
  return role ? roleName(role, locale) : (id ?? "");
}

/** Names a script gives its characters, by id: a themed script calls the Imp "Krampus" (scripts.names) */
export type ScriptNames = Record<string, string>;
/** Longest name a script gives a character */
export const MAX_SCRIPT_NAME = 40;

/** A character's name in a script that may rename it: the grimoire of a game of that script. */
export function nameInScript(id: string | null | undefined, locale: Locale, names?: ScriptNames | null) {
  return (id && names?.[id]) || characterName(id, locale);
}

/** A character's name in a game record: the script's name with the character's own in brackets, "Krampus (Čert)". */
export function nameInRecord(id: string | null | undefined, locale: Locale, names?: ScriptNames | null) {
  const own = characterName(id, locale);
  const given = id ? names?.[id] : undefined;
  return given && given !== own ? `${given} (${own})` : own;
}

/** A homebrew character the wiki had no art for gets this: its name tells it apart */
export const NO_ICON = "/botc/roles/hb/_.webp";

export function roleIcon(id: string) {
  const entry = homebrewById.get(id);
  if (entry) return entry.noIcon ? NO_ICON : `/botc/roles/hb/${id}.webp`;
  return `/botc/roles/${id}.webp`;
}

/** Good at the start of the game; travellers pick a side when they join, so they count as neither. */
export function roleSide(team: RoleTeam): "good" | "evil" | null {
  if (team === "townsfolk" || team === "outsider") return "good";
  if (team === "minion" || team === "demon") return "evil";
  return null;
}

const baseScripts: Record<string, RoleEdition> = {
  "trouble brewing": "tb",
  "potíže přicházejí": "tb",
  "bad moon rising": "bmr",
  "čas krvavého měsíce": "bmr",
  "sects and violets": "snv",
  "sects & violets": "snv",
  "sekty a fialky": "snv",
};

/** The base edition a script name stands for (in English or Czech), so its characters can be offered first. */
export function editionOfScript(name: string): RoleEdition | null {
  return baseScripts[name.trim().toLowerCase()] ?? null;
}
