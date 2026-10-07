import type { Locale } from "@/i18n/dictionaries";

/**
 * Texts of the public pages that organisers edit in the admin (Texty webu). The texts here are the defaults:
 * a block shows them until someone saves their own version, and "back to the original text" returns to them.
 * The layout around the texts (the boxes, the Discord button, the button to the sessions) stays in the code.
 *
 * "line" = one line of plain text, "markdown" = formatted text (headings, lists, links, a highlighted box as
 * a quote), see components/markdown.tsx.
 *
 * No database or server code here: the admin's client components get these defaults too.
 */

export type TextKind = "line" | "markdown";

type TextBlockDef = { key: string; kind: TextKind; defaults: Record<Locale, string> };
type SitePageDef = { slug: string; path: string; blocks: readonly TextBlockDef[] };

const CLUB_BODY_CS = `## Na místě

- Při příchodu se **čitelně zapiš do prezenční listiny**. Když se v ní nenajdeš, zapiš se na první volný řádek na konci.
- K zapůjčení jsou **klubové i soukromé hry**. Klubové si můžeš vzít i **domů** proti vratné záloze **500 Kč**.
- Všichni si **tykáme** – v klubu i na Discordu.

## Pravidla

- 👐 Vzájemný respekt a slušnost
- ❌ Žádný spam a trolling
- 🗑️ V klubu zachovej pořádek a čistotu

## Na Discordu

- Nastav si na našem serveru **stejnou přezdívku, jakou používáš v klubu**, ať se poznáme a víme, na koho čekáme. V seznamu členů klikni pravým tlačítkem (nebo ťukni) na sebe → „Change Server Profile“. Změna platí jen pro náš server.
- Seznam klubových her a další užitečné odkazy najdeš v kanálu **#🔗-užitečné-odkazy**, odpovědi na časté otázky v **#❓-časté-otázky**.
`;

const CLUB_BODY_EN = `## At the club

- When you arrive, **sign the attendance sheet legibly**. If you can't find your name on it, write it on the first empty line at the end.
- You can borrow both **club and private games** to play on-site. Club games can also be taken **home** for a refundable deposit of **500 CZK**.
- We're all on a **first-name basis**, at the club and on Discord.

## Rules

- 👐 Mutual respect and good manners
- ❌ No spam or trolling
- 🗑️ Keep the club tidy and clean

## On Discord

- Please set your **nickname on our server to the one you use at the club**, so we recognise each other and know who we're waiting for. Open the member list, right-click (or tap) your name → “Change Server Profile”. It only changes your name on our server.
- The list of club games and other useful links are in **#🔗-useful-links**, answers to common questions in **#❓-faq**.
`;

const ABOUT_BODY_CS = `## Co je Krvavá hodina odbila

**Krvavá hodina odbila** je velká blafovací a sociálně dedukční hra pro zhruba **5–20 hráčů** a jednoho **Vypravěče**. Prakticky ale nejlépe funguje, když se sejde **aspoň 8 lidí**.

Každý hráč dostane **unikátní roli**. Některé role patří na stranu **dobra**, jiné na stranu **zla**. Dobří se snaží přijít na to, kdo je Démon, zatímco zlí se snaží město zmást, rozhádat a dovést k chybným popravám.

Hra se odehrává v ponurém městečku **Ravenswood Bluff**, kde se přes den vyšetřuje, vyjednává, lže, blafuje a hlasuje o popravě podezřelých. V noci pak **Démon a jeho přisluhovači** tajně útočí a další role získávají informace nebo používají své schopnosti.

Největší rozdíl oproti klasickým dedukčním hrám je ten, že **smrt tě nevyřadí ze hry**. I mrtví hráči dál mluví, dál se snaží pomoct svému týmu a stále mají omezený vliv na hru. Díky tomu se nikdo nenudí a partie drží napětí až do konce.

> **Dobro vyhraje**, když se mu podaří odhalit a popravit Démona.\\
> **Zlo vyhraje**, když Démon přežije tak dlouho, až ve hře zůstanou jen **dva živí hráči**.

## Jak probíhá hra

### 1. Noc

- Vypravěč postupně probouzí příslušné role a vyhodnocuje jejich schopnosti.
- Některé postavy získávají informace, jiné někoho chrání, matou nebo zabíjejí.
- **První noc** bývá speciální a často rozdává důležité startovní informace.

### 2. Den

- Hráči se dozví, co se během noci stalo, typicky kdo zemřel.
- Následují **soukromé debaty** v menších skupinkách i **veřejná diskuze**.
- Pak přijde na řadu **nominace a hlasování** o tom, kdo bude popraven.
- Pokud poprava projde, hráč zemře a hra pokračuje dál – nebo končí, pokud padl Démon.

## Proč je Krvavka tak dobrá

- každý hráč má **vlastní schopnost**, takže každý je důležitý
- i po smrti jsi **pořád ve hře**
- je tam hodně prostoru pro **logiku, blafování i sociální hru**
- partie bývají napínavé až do úplného konce
- funguje dobře jak pro lidi, co chtějí dedukovat, tak pro ty, co si chtějí hlavně povídat, kecat a motat ostatní

## Krvavka v rámci DoUPěte

Není problém vypsat Krvavku v rámci DoUPěte jako klasické klubové hraní. Když o to bude zájem, můžeme se domluvit a něco zorganizovat – jen je potřeba počítat s tím, že tahle hra chce **víc lidí** než běžné deskovky.

Domluvu můžeme klidně řešit v rámci **#chat** nebo v běžném kanálu ke konkrétnímu klubovému hraní.

## Další odkazy

- [Přehled hry na BotC Central](https://botc-central.web.app/krvava-hodina)
- [Krvavá hodina odbila na Zatrolených hrách](https://www.zatrolene-hry.cz/spolecenska-hra/krvava-hodina-odbila-12158/)
- [bloodontheclocktower.com](https://bloodontheclocktower.com/)
`;

const ABOUT_BODY_EN = `## What is Blood on the Clocktower

**Blood on the Clocktower** is a large bluffing and social deduction game for roughly **5–20 players** plus one **Storyteller**. In practice it works best with **at least 8 people**.

Every player gets a **unique role**. Some roles belong to the side of **good**, others to **evil**. The good team tries to work out who the Demon is, while the evil team tries to confuse the town, sow discord and steer it towards executing the wrong people.

The game takes place in the gloomy town of **Ravenswood Bluff**. During the day the town investigates, negotiates, lies, bluffs and votes on whom to execute. At night the **Demon and its Minions** strike in secret, while other roles gather information or use their abilities.

The biggest difference from classic deduction games is that **death doesn't knock you out of the game**. Dead players keep talking, keep helping their team and still have a limited influence on the game. Nobody gets bored and the tension holds until the very end.

> **Good wins** when it manages to identify and execute the Demon.\\
> **Evil wins** when the Demon survives until only **two living players** remain.

## How a game plays out

### 1. Night

- The Storyteller wakes the relevant roles one by one and resolves their abilities.
- Some characters gain information, others protect, mislead or kill someone.
- The **first night** is special and often hands out important starting information.

### 2. Day

- Players learn what happened during the night, typically who died.
- Then come **private conversations** in small groups and a **public discussion**.
- Next are **nominations and voting** on who will be executed.
- If the execution passes, the player dies and the game continues – or ends, if the Demon has fallen.

## Why the game is so good

- every player has **their own ability**, so everyone matters
- even after death you are **still in the game**
- there is plenty of room for **logic, bluffing and social play**
- games tend to stay tense until the very end
- it works both for people who love deducing and for those who mainly want to chat, scheme and mess with the others

## Playing with the DoUPě club

We can happily schedule Blood on the Clocktower as a regular club game night with DoUPě. If there is interest, we'll arrange something – just keep in mind that this game needs **more people** than the usual board games.

We can arrange it in **#chat** or in the usual channel for a specific club game night.

## More links

- [Game overview on BotC Central (Czech)](https://botc-central.web.app/krvava-hodina)
- [Blood on the Clocktower on Zatrolené hry (Czech)](https://www.zatrolene-hry.cz/spolecenska-hra/krvava-hodina-odbila-12158/)
- [bloodontheclocktower.com](https://bloodontheclocktower.com/)
`;

/** The editable pages in the order the admin lists them; `path` is where the page is on the public site. */
export const SITE_PAGES = [
  {
    slug: "klub",
    path: "/",
    blocks: [
      {
        key: "klub.intro",
        kind: "line",
        defaults: {
          cs: "Kdy a kde hrajeme, jak se přihlásit na hry a jak to u nás chodí.",
          en: "A board game club in Olomouc – when and where we play, how to sign up for games and how things work.",
        },
      },
      {
        key: "klub.info",
        kind: "markdown",
        defaults: {
          cs: "📅 Každé **úterý** a **čtvrtek** v **16:30**\n\n📍 [Přírodovědecká fakulta UP Olomouc](https://maps.app.goo.gl/strUg6nAKamStgeB7), učebna **1.037**\n",
          en: "📅 Every **Tuesday** and **Thursday** at **4:30 PM**\n\n📍 [Faculty of Science, Palacký University Olomouc](https://maps.app.goo.gl/strUg6nAKamStgeB7), room **1.037**\n",
        },
      },
      {
        key: "klub.discordTitle",
        kind: "line",
        defaults: { cs: "Jsme na Discordu", en: "Find us on Discord" },
      },
      {
        key: "klub.discordText",
        kind: "markdown",
        defaults: {
          cs: "**Discord je náš hlavní komunikátor.** Zatím se přes něj přihlašuješ i na klubová hraní.\n",
          en: "**Discord is our main communication channel.** For now, it's also where you sign up for club game nights.\n",
        },
      },
      {
        key: "klub.discordNote",
        kind: "markdown",
        defaults: {
          cs: "Výjimkou je [Krvavka](/botc) (Krvavá hodina odbila) – na tu se registruješ přímo tady na webu.\n",
          en: "[Blood on the Clocktower](/botc) is the exception – you sign up for it right here on this site.\n",
        },
      },
      { key: "klub.body", kind: "markdown", defaults: { cs: CLUB_BODY_CS, en: CLUB_BODY_EN } },
      {
        key: "klub.messageTitle",
        kind: "line",
        defaults: { cs: "Nech nám vzkaz", en: "Leave us a message" },
      },
      {
        key: "klub.messageText",
        kind: "markdown",
        defaults: {
          cs: "Nemáš Discord, nebo nám chceš napsat něco mimo něj? Pošli nám vzkaz a odpovíme ti e-mailem.\n",
          en: "Not on Discord, or want to tell us something outside it? Send us a message and we'll reply by e-mail.\n",
        },
      },
    ],
  },
  {
    slug: "krvavka",
    path: "/botc",
    blocks: [
      {
        key: "krvavka.intro",
        kind: "line",
        defaults: {
          cs: "Vyber si termín, vyplň krátký formulář a potvrzení ti přijde na e-mail. Účet nepotřebuješ.",
          en: "Pick a session, fill in a short form and you'll get a confirmation by e-mail. No account needed.",
        },
      },
    ],
  },
  {
    slug: "o-hre",
    path: "/botc/o-hre",
    blocks: [
      {
        key: "o-hre.intro",
        kind: "line",
        defaults: {
          cs: "Blood on the Clocktower, česky Krvavá hodina odbila. Krátký úvod pro ty, kdo hru ještě nehráli.",
          en: "Blood on the Clocktower. A short introduction for those who haven't played yet.",
        },
      },
      { key: "o-hre.body", kind: "markdown", defaults: { cs: ABOUT_BODY_CS, en: ABOUT_BODY_EN } },
    ],
  },
] as const satisfies readonly SitePageDef[];

export type SitePage = (typeof SITE_PAGES)[number];
export type SitePageSlug = SitePage["slug"];
export type TextBlock = SitePage["blocks"][number];
export type TextKey = TextBlock["key"];
/** The blocks of one page */
export type PageTextKey<S extends SitePageSlug> = Extract<SitePage, { slug: S }>["blocks"][number]["key"];

/** Longest text a block takes; far above anything the pages need, it only stops pasting in a whole book. */
export const MAX_TEXT_LENGTH: Record<TextKind, number> = { line: 300, markdown: 20_000 };

export function sitePage(slug: string): SitePage | undefined {
  return SITE_PAGES.find((p) => p.slug === slug);
}
