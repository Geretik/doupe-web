/**
 * What changed on the site, for admin → Novinky; newest first, one entry per day of deploys.
 * Every change a player or an organiser notices gets a line here in the same commit (see CLAUDE.md):
 * in Czech, short, from the user's side; dependencies, CI and refactoring stay out.
 */

/** Who notices the change: players on the public site, or organisers in the admin */
export type ChangeAudience = "players" | "organizers";

export type ChangeItem = { for: ChangeAudience; text: string; /** Where to see it */ href?: string };

export type ChangelogEntry = { /** YYYY-MM-DD */ date: string; title: string; items: ChangeItem[] };

export const changelog: ChangelogEntry[] = [
  {
    date: "2026-10-08",
    title: "Přihlášení QR kódem a odkazem z e-mailu, Opilec v pytlíku",
    items: [
      {
        for: "organizers",
        text: "Přihlášení QR kódem: na přihlášení do adminu (třeba na klubovém tabletu) klepni na „Přihlásit QR kódem z telefonu“ a kód naskenuj telefonem, kde jsi přihlášený/á – v Profilu → Naskenovat QR kód, nebo fotoaparátem – a přihlášení potvrď. Heslo na tabletu psát nemusíš.",
        href: "/admin/profil",
      },
      { for: "organizers", text: "Profil (vpravo v menu místo Změnit heslo): skenování QR kódu, změna hesla a „Odhlásit ze všech ostatních zařízení“.", href: "/admin/profil" },
      {
        for: "organizers",
        text: "Přihlášení odkazem z e-mailu: na přihlášení do adminu „Přihlásit odkazem z e-mailu“ pošle na tvůj e-mail odkaz, který tě bez hesla přihlásí na zařízení, kde ho otevřeš. Platí 15 minut a jde použít jednou.",
      },
      {
        for: "organizers",
        text: "Grimoár: s Opilcem v pytlíku se počítá jeden Měšťan navíc (s Marionetou dobrá postava navíc, Blázen může mít druhého Démona). Kdo ho při rozdání nebo losování dostane, je Opilec a myslí si, že je tím Měšťanem; Marioneta vždy sedí vedle Démona. Losovat jde i s Opilcem v pytlíku.",
        href: "/admin/grimoary",
      },
      {
        for: "organizers",
        text: "Grimoár: „🎲 Naplnit náhodně“ naplní pytlík náhodnými postavami ze scriptu tak, aby seděly počty (i s Baronem, Opilcem…) – nic nerozdá, jde to zkoušet znovu a upravit. Blafy Démona jdou vybrat i vylosovat (🎲) a nabízí se jen dobré postavy mimo pytlík.",
        href: "/admin/grimoary",
      },
      {
        for: "organizers",
        text: "Grimoár: pytlík na celou obrazovku má i blafy Démona a − / + pro počet hráčů; grimoár zabírá celou šířku okna.",
      },
      {
        for: "organizers",
        text: "Grimoár: Příprava a Konec hry jsou tlačítka dole pod panelem místo záložek. Příprava se otevře přes celou obrazovku (i se „Začít hru“), Konec hry v okně, kde vybereš vítěze, napíšeš poznámku ke hře (zapíše se k odehrané hře) a hru ukončíš.",
      },
      {
        for: "organizers",
        text: "Grimoár, noc: u kroku postavy jsou její žetony – ťukneš na žeton a pak na hráče (Travič otráví, Mnich chrání, Démon zabije); žeton, který má postava jen jeden, se přesune k novému hráči. Krok upozorní, když je hráč otrávený nebo opilý, Kuchařovo a Empatovo číslo spočítá sám.",
        href: "/admin/grimoary",
      },
      {
        for: "organizers",
        text: "Grimoár: po rozdání postav je v panelu vedle kruhu ještě před hrou karta „1. noc“ – info pro Pradlenu, Knihovníka, Vyšetřovatele a další si připravíš dopředu (žeton na správného hráče a na někoho jiného) a v noci je u kroku napsané, co ukázat.",
      },
      {
        for: "organizers",
        text: "Grimoár: u hráče s jednorázovou schopností (Zabiják, Umělec, Čaroděj, Panna…) tlačítko „Použil/a schopnost“; v kruhu je pak u hráče žeton.",
      },
    ],
  },
  {
    date: "2026-10-07",
    title: "Grimoár, vzkazy organizátorům, novinky",
    items: [
      {
        for: "organizers",
        text: "Grimoár pro vypravěče, dělaný na tablet: kruh hráčů s postavami, smrtí, hlasy a připomínkami; Příprava se scriptem, rozložením, pytlíkem a blafy; pořadí noci jen s postavami ve hře. Konec hry ji zapíše do odehraných her termínu. Ukládá se sám, i bez sítě.",
        href: "/admin/grimoary",
      },
      {
        for: "organizers",
        text: "Grimoár: do kruhu jdou vložit dveře a místo vypravěče (kruh se otočí, aby bylo dole), přidat místa bez jmen a „Smazat jména“ pro nové rozesazení; script jde vložit jako JSON.",
      },
      {
        for: "organizers",
        text: "Grimoár: „Losování hráči“ – hráči si na tabletu sami vylosují postavu z pytlíku, jména se pak doplní ťuknutím na přezdívky přihlášených.",
      },
      { for: "organizers", text: "Grimoár: hráče jde v kruhu přetáhnout na jiné místo; hotové rozesazení zamkne zámek 🔓 v rohu kruhu." },
      {
        for: "organizers",
        text: "Grimoár: u pytlíku je u každého týmu, kolik postav v něm je a kolik jich podle pravidel patří k počtu hráčů; pytlík jde otevřít na celou obrazovku, kde jsou počty velké nahoře a script se vejde na tablet bez posouvání.",
      },
      {
        for: "organizers",
        text: "Grimoár: postavy, které mění rozložení (Baron, Kmotr, Fang Gu, Vyvolávač…), se do počtů v pytlíku započítají samy – u volby jako Kmotr „1 nebo 3“ – a na jejich dlaždici je napsané, co dělají („+2 Podivíni“).",
      },
      { for: "organizers", text: "Grimoáry maže jen správce – svoje i odehrané hry ostatních, tlačítkem 🗑️ v seznamu nebo v grimoáru na kartě Hra.", href: "/admin/grimoary" },
      {
        for: "players",
        text: "Na konci úvodní stránky je formulář „Nech nám vzkaz“; vzkaz přijde organizátorům e-mailem a odpovídá se rovnou z pošty.",
        href: "/#vzkaz",
      },
      { for: "organizers", text: "Script z draftu jde uložit do knihovny scriptů klubu (a později aktualizovat); odtud se nabízí u termínu i v hlasování." },
      { for: "organizers", text: "„+ Nový termín“ je tlačítko na stránce Termíny místo položky v menu.", href: "/admin" },
      { for: "organizers", text: "Novinky: tahle stránka. Tečka v menu ukáže, že od posledního čtení něco přibylo." },
      { for: "organizers", text: "Statistiky: u pravidelných hráčů je vedle večerů i počet odehraných her (podle soupisek her, bez vyprávění).", href: "/admin/statistiky" },
    ],
  },
  {
    date: "2026-10-06",
    title: "Hlasování o scriptu, drafty, knihovna scriptů, sbírka her",
    items: [
      {
        for: "players",
        text: "Hlasování o scriptu: přihlášení i náhradníci na odkazu ke své registraci zaškrtnou, co by chtěli hrát; u termínu jsou vidět počty hlasů.",
      },
      {
        for: "organizers",
        text: "Hlasování o scriptu se nastaví u termínu; v adminu je vidět, kdo jak hlasoval. Končí začátkem termínu, nebo ho jde ukončit (a znovu otevřít) ručně.",
      },
      {
        for: "organizers",
        text: "Drafty: snake draft postav mezi účty klubu (Personal Pool i Shared Pool) s pozvánkami, pořadím a historií picků; z poolu si každý složí script. Kdo je na tahu, to vidí hned nahoře a v titulku záložky, po 24 hodinách mu přijde e-mail.",
        href: "/admin/drafty",
      },
      {
        for: "organizers",
        text: "Scripty: společná knihovna scriptů klubu z JSONu (script tool, botcscripts.com, oficiální aplikace). Formulář termínu i hlasování z ní nabízí a odkaz do script toolu doplní sám.",
        href: "/admin/scripty",
      },
      { for: "players", text: "Sbírka her klubu s hledáním a filtry podle počtu hráčů, klubových her a rozšíření.", href: "/hry" },
    ],
  },
  {
    date: "2026-10-05",
    title: "Moje hry se statistikami, vypravěči",
    items: [
      {
        for: "players",
        text: "Moje hry: osobní statistiky (večery, hry, výhry za dobro a zlo, vyprávění, nejčastější postavy a scripty) a proběhlé večery se soupiskami her.",
      },
      {
        for: "organizers",
        text: "Statistiky vypravěčů: ve statistikách tabulka Vypravěči a u termínu u přezdívky, kolik her kdo odvyprávěl a kdy naposledy – ať jde vyprávění rozdělit spravedlivě.",
        href: "/admin/statistiky",
      },
      { for: "organizers", text: "Hráče u termínu jde upravit tužkou ✏️ (přezdívka, e-mail, telefon, časy, poznámka…), i po odehrání." },
      { for: "organizers", text: "Rozdělení hráčů ke stolům je zrušené." },
    ],
  },
  {
    date: "2026-10-04",
    title: "Kdo co hrál, rychlá registrace, texty webu",
    items: [
      {
        for: "players",
        text: "V archivu je u odehraných her „Kdo co hrál“: postavy s ikonami, vypravěči, za koho se považoval Opilec, co znala Víla, bluffy démona. Každá hra má vlastní rámeček se štítkem vítěze.",
        href: "/botc/archiv",
      },
      { for: "organizers", text: "Soupisku hry („Kdo co hrál“) i celé odehrané hry jde vyplnit a upravit v adminu termínu." },
      {
        for: "organizers",
        text: "Rychlá registrace v adminu termínu – stačí přezdívka. Náhradníka jde přidat na termín i u plného termínu (+1 místo).",
      },
      {
        for: "organizers",
        text: "Texty webu: texty stránek Klub, Krvavka a O hře upraví kterýkoli organizátor ve formátovacím editoru, česky i anglicky, s historií verzí.",
        href: "/admin/web",
      },
      { for: "organizers", text: "Menu adminu je ve skupinách Krvavka / Klub a zvýrazní stránku, na které jsi." },
    ],
  },
  {
    date: "2026-10-02",
    title: "Jazyk hry, playlist, zapomenuté heslo",
    items: [
      { for: "players", text: "U každého termínu je vidět jazyk hry (čeština, angličtina, obojí) – na kartě, v detailu, v e-mailech i na plakátu." },
      { for: "players", text: "Playlist k termínu: hudba k večeru na rozkliknutí u termínu." },
      { for: "organizers", text: "Playlist se do termínu vloží zkopírováním tabulky skladeb (z dokumentu, tabulky nebo webu), s náhledem." },
      { for: "organizers", text: "Zapomenuté heslo do adminu jde obnovit odkazem na e-mail." },
      { for: "organizers", text: "Každý účet má vlastní kalendář pro organizátory a odkaz na něj jde vyměnit." },
      { for: "organizers", text: "Odhlášení hráče z termínu se potvrzuje; formuláře po chybě nemažou, co bylo vyplněné." },
    ],
  },
  {
    date: "2026-10-01",
    title: "Web klubu a Krvavka jako jeho část",
    items: [
      {
        for: "players",
        text: "Úvodní stránka webu je Klub; Krvavka má vlastní část s vlastním menu. Staré odkazy na termíny, registrace i Moje hry dál fungují.",
        href: "/botc",
      },
      { for: "players", text: "Karta termínu je přehlednější: volná místa a tlačítko Registrovat na jednom řádku." },
      {
        for: "organizers",
        text: "Formulář termínu: datum z kalendáře a časy po 15 minutách, nový termín převezme časy z minulého, nabídne dřív použitá místa, vypravěče a scripty.",
      },
      { for: "organizers", text: "Na Discord chodí jen oznámení nových termínů; příspěvek „zbývá míst“ je vypnutý." },
    ],
  },
  {
    date: "2026-09-30",
    title: "Ochrana údajů, stav registrací, plakát s QR kódem",
    items: [
      {
        for: "players",
        text: "Jméno, e-mail a telefon se 14 dní po termínu samy smažou; stránka Ochrana osobních údajů popisuje, co se s údaji děje.",
        href: "/ochrana-udaju",
      },
      { for: "organizers", text: "Hráče jde na jeho žádost úplně smazat (🗑️ u registrace)." },
      {
        for: "players",
        text: "Registrace u termínu můžou být otevřené, zatím neotevřené nebo pozastavené; u těch s naplánovaným otevřením je vidět, kdy to bude.",
      },
      {
        for: "organizers",
        text: "Registrace jde otevřít a pozastavit tlačítkem nebo nechat otevřít samy v nastavený čas; k termínu je QR kód a plakát A4 k vytištění.",
      },
      { for: "players", text: "Web běží na www.doupeol.cz, staré adresy přesměrují. „Sdílet“ u termínu posílá jen odkaz s náhledem." },
      { for: "organizers", text: "Změna vlastního hesla, odkaz na nové heslo od správce; admin upozorní na chybějící nastavení serveru." },
      { for: "organizers", text: "Pražská sekce je zrušená, web je jen pro Olomouc." },
    ],
  },
  {
    date: "2026-09-29",
    title: "DoUPě Olomouc",
    items: [
      { for: "players", text: "Web se jmenuje DoUPě Olomouc a má stránku Klub: kdy a kde se hraje, Discord, pravidla a jak to v klubu chodí.", href: "/" },
    ],
  },
  {
    date: "2026-09-23",
    title: "Jednodušší registrace",
    items: [
      { for: "players", text: "Při registraci je povinná jen přezdívka a e-mail; jméno a telefon podle termínu." },
      {
        for: "organizers",
        text: "U termínu jde nastavit, jestli hráči zadávají přesný příchod a odchod, nebo jen „přijdu později“, a jestli je telefon povinný.",
      },
      { for: "players", text: "Hlavička a menu se lépe vejdou na telefon." },
    ],
  },
  {
    date: "2026-09-22",
    title: "Kdo kdy přijde",
    items: [{ for: "organizers", text: "U termínu je hodinový přehled, kolik lidí bude v kterou hodinu (podle příchodů a odchodů)." }],
  },
  {
    date: "2026-09-21",
    title: "Náhradníci, kalendář, účty organizátorů",
    items: [
      { for: "players", text: "Náhradníci: plný termín řadí do pořadníku a uvolněné místo dostane první v pořadí, s e-mailem." },
      { for: "players", text: "Termín jde přidat do kalendáře (i odběr všech termínů) a den před hrou přijde připomínka e-mailem." },
      {
        for: "players",
        text: "Archiv proběhlých večerů, Moje hry (odkaz e-mailem), u přihlášky „můžu dělat vypravěče“ 🎩, „jsem nováček“ a poznámka pro organizátory.",
      },
      { for: "organizers", text: "Účty organizátorů s pozvánkami a rolemi správce a organizátor.", href: "/admin/ucty" },
      {
        for: "organizers",
        text: "Export CSV, hromadný e-mail přihlášeným, duplikace a opakující se termíny, docházka, oznámení na Discord, statistiky a zápis odehraných her.",
      },
      { for: "organizers", text: "Admin je i v angličtině." },
    ],
  },
  {
    date: "2026-09-20",
    title: "Spuštění",
    items: [
      {
        for: "players",
        text: "Registrace na Krvavku bez účtu: termíny, e-mail s odkazem na úpravu či zrušení, veřejný seznam přihlášených, odkazy na scripty.",
      },
      { for: "players", text: "Stránka O hře a celý web česky i anglicky.", href: "/botc/o-hre" },
      { for: "organizers", text: "Admin pro termíny a registrace; tužka na veřejných stránkách vede rovnou na úpravu termínu." },
    ],
  },
];

/** Changes with the newest entry, so a line added to today's entry counts as new too */
export function changelogStamp() {
  const [latest] = changelog;
  return latest ? `${latest.date}.${latest.items.length}` : "";
}
