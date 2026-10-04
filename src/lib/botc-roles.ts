import type { Locale } from "@/i18n/dictionaries";

/**
 * Characters a player can have in a game – no Fabled or Loric, those belong to the Storyteller.
 * Ids as in the official script tool; Czech names from the club's script tool (boardgames, roles.cs.overrides.ts).
 * Icons: public/botc/roles/<id>.webp, the official character icons from wiki.bloodontheclocktower.com that the
 * club's script tool shows too (© The Pandemonium Institute), cropped and shrunk to 64 px.
 */
export const roleTeams = ["townsfolk", "outsider", "minion", "demon", "traveller"] as const;
export type RoleTeam = (typeof roleTeams)[number];
export type RoleEdition = "tb" | "bmr" | "snv" | "carousel";
export type BotcRole = { id: string; team: RoleTeam; edition: RoleEdition; en: string; cs: string };

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
  { id: "yaggababble", team: "demon", edition: "carousel", en: "Blabla Jaga", cs: "Blabla Jaga" },
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
  { id: "thief", team: "traveller", edition: "tb", en: "Thief", cs: "Thief" },
  { id: "apprentice", team: "traveller", edition: "bmr", en: "Apprentice", cs: "Učedník" },
  { id: "voudon", team: "traveller", edition: "bmr", en: "Voudon", cs: "Vudun" },
  { id: "beggar", team: "traveller", edition: "tb", en: "Beggar", cs: "Žebrák" },
];

/** Value of the game form's character select for a player who did not play that game. */
export const SAT_OUT = "__out";
/** Stored instead of a character for a player who ran the game; no character has this id. */
export const STORYTELLER = "storyteller";

/** Demon bluffs are good characters that are not in play; the Demon usually gets three. */
export const BLUFF_COUNT = 3;
export const bluffTeams: readonly RoleTeam[] = ["townsfolk", "outsider"];

/** Characters who are told they are someone else, and the teams that someone can be from. */
const believedTeams: Partial<Record<string, readonly RoleTeam[]>> = {
  drunk: ["townsfolk"],
  lunatic: ["demon"],
  marionette: ["townsfolk", "outsider"],
};

/** The teams the character's "thinks they are" can be from, or undefined when the character has none. */
export function believedTeamsOf(roleId: string | null | undefined) {
  return roleId ? believedTeams[roleId] : undefined;
}

const byId = new Map(botcRoles.map((r) => [r.id, r]));

export function findRole(id: string | null | undefined) {
  return id ? byId.get(id) : undefined;
}

export function roleName(role: BotcRole, locale: Locale) {
  return locale === "en" ? role.en : role.cs;
}

export function roleIcon(id: string) {
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
