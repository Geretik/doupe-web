import type { Locale } from "@/i18n/dictionaries";
import type { AdminArea } from "@/db/schema";

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

/** Each "##" heading is one question; on the site the questions open on a tap (components/markdown, `questions`). */
const FAQ_BODY_CS = `## 🚂 Jak se k nám dostanete?

**Adresa:**\\
[Přírodovědecká fakulta Univerzity Palackého v Olomouci](https://maps.app.goo.gl/strUg6nAKamStgeB7)\\
17. listopadu 1192/12, 779 00 Olomouc\\
učebna **1.037**

Z hlavního nádraží se dá pohodlně dojít i pěšky (15–20 minut). Nejblíže jsou zastávky **Envelopa** nebo **Žižkovo náměstí** (tramvaj), případně **17. listopadu** a **Envelopa** (autobus).

## 🧑‍🏫 Co mám vědět před příchodem?

Před naším začátkem probíhá v místnosti výuka, takže se může stát, že se dostaneme dovnitř až v **16:35**. V klidu tedy **vyčkej na chodbě**, dokud nebudou dveře otevřené.

## 🎒 Jdu poprvé – co si mám vzít s sebou?

Vezmi si s sebou **pití**, a pokud se plánuješ zdržet déle, zvaž i **jídlo**. V atriu budovy je k dispozici mikrovlnka a pítko s pitnou vodou, najdeš tam také bistro FreshUP (otevřeno do 17:00) a pár automatů. Hráči si často objednávají i něco z dovozu (Bolt Food, Wolt, Foodora, …).

## 🎲 Plánujete dorazit poprvé jako skupinka a ještě nás neznáte?

V pohodě, klidně se stavte! 🙂 Jen bude lepší, když nám dáte vědět dopředu, **aby se s vámi počítalo**. Ve čtyřech a více se těžko přidáváte k jiným skupinám, a pokud chcete, aby vám někdo hry ukázal a vysvětlil, je fajn to předem domluvit.

Organizátoři sami hrají a často mívají delší hry naplánované dopředu, ale po domluvě se určitě najde někdo, kdo s vámi stráví čas a provede vás. Jen prosím počítejte s tím, že to děláme **dobrovolně** – nikdo z nás za to není placený. ❤️

## 🚗 Kde parkovat?

Obvykle se dá zaparkovat na **ulici 17. listopadu** přímo u fakulty. Případně i v bočních uličkách – jen pozor na **parkovací zóny**.

## 💸 Kolik stojí vstup?

**Nic.** Vstup na hraní je **zdarma**. Stačí se po příchodu **zapsat do prezenčky**.

## 🕟 Přijdu později než v 16:30

Žádný problém. Hrajeme od **16:30** zhruba do **22:00**. Přijít můžeš kdykoliv v průběhu. Partie se průběžně dohrávají a začínají další hry, takže se může stát, že po příchodu chvíli počkáš, než někdo dohraje.

## 🤝 Nemám domluvenou žádnou hru – můžu přijít?

**Ano.** Na každém hraní jsou lidé, kteří nemají nic domluvené a řeší hry až na místě. Máme členy, co takto fungují už roky.

**Domluva her na Discordu** je jen záruka, že **daná skupina opravdu začne hrát ve smluvený čas**. Obvykle se takto domlouvají hlavně větší hry. Pokud se někdo zdrží, ostatní na něj většinou počkají. V případě potíží, zpoždění nebo i **zaspání** stačí dát vědět, aby ostatní věděli, jak na tom jsi, a případně vytáhli nějakou „čekačku“.

## 🎓 Nejsem student UPOL, nebo student obecně

Pro vstup do klubu nemusíš být student. Jsme přidružení k univerzitě a vykazujeme statistiku návštěvnosti pro PřF, takže v prezenčce jen u vztahu k Univerzitě Palackého vybereš **Ne**.

## 📜 Neznám pravidla hry

Pravidla každé hry někdo na začátku vysvětlí. Při domlouvání hry na Discordu není špatné neznalost pravidel zmínit.

## 💶 Jak funguje půjčování her na doma?

Hry si můžeš půjčit **proti vratné kauci 500 Kč**, kterou skládáš v hotovosti u organizátora na místě. Kauci dostaneš zpět, když hru v pořádku vrátíš.

## 💥 Vytáhl jsem ze skříně hru a je poškozená

Bohužel i tohle se může stát. Nahlas tuhle skutečnost **organizátorovi na místě**.

## 🐲 Chci si zahrát D&D nebo jiné RPG

Můžeš využít kanál **#👀-hledám-partu-lfg** na našem Discordu. V klubu přímo RPG nehrajeme, ale dost návštěvníků hrává nějakou formu RPG i LARPu mimo klub.
`;

const FAQ_BODY_EN = `## 🇬🇧 How is it with English at the club?

Most of us know English to some degree, but if you want to make sure that somebody will explain a game to you in English, ask in advance (see also the question about groups below).

We have games that are language independent (*jazykově nezávislá*) and some in English (*anglická verze*) – check out our [game collection](/hry).

## 🚂 How do I get to the club?

**Address:**\\
[Přírodovědecká fakulta Univerzity Palackého v Olomouci](https://maps.app.goo.gl/strUg6nAKamStgeB7) (Faculty of Science, Palacký University)\\
17. listopadu 1192/12, 779 00 Olomouc\\
room **1.037**

You can easily walk from the main train station (15–20 minutes). Nearest stops: **Envelopa** or **Žižkovo náměstí** (tram), **17. listopadu** and **Envelopa** (bus).

## 🧑‍🏫 What should I know before coming to a meeting?

There are classes in the room before our meetings start, so we may not get in until **16:35**. Simply **wait in the corridor** until the doors are open.

## 🎒 What should I bring with me?

Bring **something to drink** and, if you plan to stay longer, consider **something to eat**. In the atrium of the faculty there is a microwave and a water fountain, as well as the bistro FreshUP (open until 17:00) and some vending machines. Players often order take-out with delivery (Bolt Food, Wolt, Foodora, …).

## 🎲 Are you newcomers and coming as a group?

We're happy to welcome you! 🙂 However, we would appreciate it if you let us know beforehand, so we can **accommodate you**. As a group of four or more it's harder for you to join other players, and if you would like to have some of our games explained, it's better to communicate that in advance.

The organisers are also playing themselves and often plan longer games in advance, but if you let us know, we can find somebody to spend time with you and show you around. Just keep in mind that we are **volunteers** and nobody is getting paid for this. ❤️

## 🚗 Where to park?

Usually you can park directly by the faculty on **17. listopadu street**. You can also try the surrounding smaller streets, but beware of **the parking zones**.

## 💸 How much is the entry fee?

**Nothing.** Entry to our meetings is **free**. Just **sign the attendance sheet** when you arrive.

## 🕟 I'll come later than 16:30

No problem. We're playing from **16:30** to approximately **22:00**. You can come anytime in between. Games are finished and new ones are started throughout the evening, so it may happen that you will need to wait a bit for other players to finish before you can join.

## 🤝 I don't have any games planned – can I still come?

**Yes.** At each meeting there are people who don't have anything planned in advance and just choose something on the spot. In fact, we have members who have been doing that for years.

**Setting up a game on Discord** is mainly a guarantee that **this group will really start playing at the agreed time**. Usually it's done for longer games. If somebody is running late, the others will usually wait. In case of problems, delays or even **oversleeping**, just let the others know so they know what's going on and can pick up a filler game in the meantime.

## 🎓 I'm not a UPOL student, or not a student at all

You don't have to be a student to come to the club. We're associated with the university and provide attendance statistics for our faculty, so on the attendance sheet simply answer **No** to the question about your relation to Palacký University.

## 📜 I don't know the rules of a game

Usually somebody will explain the rules at the beginning of the game. If you're planning a game on Discord, it's a good idea to mention that you don't know the rules.

## 💶 How does borrowing games for home work?

You can borrow games against a refundable **500 CZK deposit**, paid in cash to one of the organisers present. You get the deposit back when you return the game in good condition.

## 💥 A game I took out of the cabinet is damaged

Unfortunately it can happen. Report the fact to **one of the organisers present**.

## 🐲 I want to play D&D or another RPG

You can use **#👀-hledám-partu-lfg** on our Discord to look for players. At club meetings we don't really play RPGs. However, many of our members play some form of RPG or LARP outside the club.
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
    slug: "faq",
    path: "/faq",
    blocks: [
      {
        key: "faq.intro",
        kind: "line",
        defaults: {
          cs: "Jak se k nám dostat, co si vzít s sebou, kolik to stojí a jak to u nás chodí.",
          en: "How to get to us, what to bring, what it costs and how things work at the club.",
        },
      },
      { key: "faq.body", kind: "markdown", defaults: { cs: FAQ_BODY_CS, en: FAQ_BODY_EN } },
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

/** The part of the admin whose organisers edit a page's texts: the Krvavka pages Krvavka, the others the club. */
export function pageArea(page: SitePage): AdminArea {
  return page.path.startsWith("/botc") ? "botc" : "club";
}

export function sitePage(slug: string): SitePage | undefined {
  return SITE_PAGES.find((p) => p.slug === slug);
}
