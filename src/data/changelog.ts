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
    title: "Grimoár: Ukázat hráči a hra bez sítě; přihlášení QR kódem a odkazem z e-mailu",
    items: [
      {
        for: "organizers",
        text: "Grimoár, 👁️ Ukázat hráči: místo papírových žetonů otočíš tablet k hráči a ten uvidí jen velkou tmavou kartu – „Jsi …“, „Tohle je Démon“, „Tito jsou tví Přisluhovači“, blafy, Pradlenina postava a dva hráči, Kuchařovo číslo, ano / ne Vědmy… U kroku noci je karta předvyplněná podle grimoáru, před ukázáním ji jde upravit (nadpis, postavy, hráči, číslo, tým, text). Ťuknutím se vrátíš k úpravě karty, ne do grimoáru.",
        href: "/admin/grimoary",
      },
      {
        for: "organizers",
        text: "Grimoár bez sítě: grimoár, který jsi na tabletu (nebo telefonu) už jednou otevřel/a, se otevře i bez připojení – i po zavření nebo obnovení stránky, s posledním stavem hry z tabletu. Hraje se normálně, ukládá se do tabletu a na server, jakmile se síť vrátí. Když se web mezitím aktualizuje, grimoár napíše „načti stránku znovu“ a nic se neztratí.",
        href: "/admin/grimoary",
      },
      {
        for: "organizers",
        text: "Grimoár: po rozdání „Ukázat hráčům jejich postavy“ v Přípravě – každému ukážeš „Jsi …“ a „Další: jméno →“ přejde k dalšímu hráči v kruhu. Opilec uvidí Měšťana, za kterého se považuje.",
        href: "/admin/grimoary",
      },
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
      {
        for: "organizers",
        text: "Grimoár: pytlík na celou obrazovku se jmenuje „Výběr žetonů“ – vybírají se v něm žetony i blafy a naplní se tam náhodně. Příprava je jen ukazuje a dole má Rozdání: Losování hráči, nebo Rozdat náhodně, které se nejdřív zeptá, jestli opravdu náhodně.",
        href: "/admin/grimoary",
      },
      { for: "organizers", text: "Grimoár: celá obrazovka skryje hlavičku, menu i patičku webu – i na telefonu, kde prohlížeč celou obrazovku neumí." },
      { for: "organizers", text: "Grimoár: výběr hráče zrušíš ✕ v panelu, dalším ťuknutím na hráče nebo ťuknutím do prázdného místa v kruhu." },
      {
        for: "organizers",
        text: "Grimoár, noc: hráč, na kterého Démon položí žeton „Mrtvý“, zemře – ledaže ho chrání Mnich, Hostinský nebo Čajová dáma, nebo je to Voják, Námořník či Šašek (ten poprvé). U kroku Démona je napsané, kdo nezemřel a proč; opilý nebo otrávený ochránce nechrání.",
        href: "/admin/grimoary",
      },
      {
        for: "organizers",
        text: "Grimoár: Pukka – když u jeho kroku přesuneš jed na nového hráče, ten otrávený minulou noc zemře (zase s výjimkou chráněných) a dostane žeton „Mrtvý“.",
      },
      {
        for: "organizers",
        text: "Grimoár: když Čert zabije sám sebe, novým Čertem se stane Šarlatová žena (je-li naživu aspoň 5 hráčů a není opilá ani otrávená), jinak jediný živý Přisluhovač; je-li jich víc, krok Čerta nabídne, koho vybrat.",
      },
      {
        for: "organizers",
        text: "Grimoár: žetony, které patří jen hráči samotnému („Bez schopnosti“ Švadleny a dalších, „Démon“ Šarlatové ženy), se u kroku noci položí rovnou jemu – na hráče se už neťuká.",
      },
      {
        for: "organizers",
        text: "Grimoár: když ve dne zemře Přisluhovač a ve hře je Pěvec, dostane Pěvec žeton „Všichni jsou opilí“ a noc u ostatních hráčů upozorní, že jsou opilí (opilý Mnich nechrání, opilý Voják zemře). Žeton zmizí za soumraku dalšího dne.",
      },
      { for: "organizers", text: "Grimoár: nový grimoár ukáže na tlačítko Příprava, kde začít; na telefonu k němu posune stránku." },
      { for: "organizers", text: "Grimoár: texty kroků noci se zalamují na řádky místo „<br/>“." },
      {
        for: "organizers",
        text: "Grimoár: se Špehem nebo Samotářem ve hře ukáže krok Kuchaře a Empata všechna čísla, která můžou vyjít (Špeh se může jevit jako dobrý, Samotář jako zlý – u každé dvojice a každého souseda zvlášť), a Pradlena, Knihovník a Vyšetřovatel všechny postavy, kterými se může jevit; opilý nebo otrávený Špeh či Samotář se jinak nejeví.",
        href: "/admin/grimoary",
      },
      {
        for: "organizers",
        text: "Grimoár: když Démon zemře ve dne a naživu je aspoň 5 hráčů, stane se Démonem Šarlatová žena a v noci se probudí, aby se to dozvěděla. Smrt označenou omylem vrátí „Oživit“ ještě týž den i se Šarlatovou ženou.",
      },
      {
        for: "organizers",
        text: "Grimoár, démoni z Bad Moon Rising a Sects & Violets: Zombuul poprvé jen vypadá mrtvý (u hráče pak „☠ Zemřel/a doopravdy“) a v noci je napsané, jestli dnes někdo zemřel; Shabaloth zabíjí dva a žetonem „Živý“ vyvrhne jednoho zpět; Pó po noci bez volby zabije tři; Fang Gu přeskočí na prvního zabitého Podivína a sám zemře; Přisluhovač zabitý Vigormortisem si nechá schopnost a otráví sousedního Měšťana; No Dashii otráví nejbližšího Měšťana z každé strany; s Vortoxem musí Měšťan dostat nepravdivou informaci a ve dne je připomínka, že bez popravy vyhrává zlo. Kmotr: v noci je napsané, jestli dnes zemřel Podivín; Profesorův žeton „Živý“ oživí mrtvého Měšťana.",
        href: "/admin/grimoary",
      },
      {
        for: "organizers",
        text: "Grimoár: záložka Kronika – po nocích a dnech, kdo zemřel (a čí schopností), kdo přežil útok Démona a díky komu, kdo ožil a kdo se stal Démonem. Při ukončení hry se z ní předvyplní poznámka ke hře.",
      },
      {
        for: "organizers",
        text: "Grimoár: Příprava a Výběr žetonů upozorní na jinxy mezi postavami v pytlíku nebo ve hře (text jinxu anglicky – české překlady ve script toolu jsou zčásti zastaralé).",
      },
      { for: "organizers", text: "Grimoár: žetony „Mrtvý“ Yaggababble v noci zabíjejí jako u ostatních Démonů." },
      {
        for: "organizers",
        text: "Grimoár, experimentální démoni: Al-Hadikhia – žeton „Chose death“ zabije, „Chose life“ oživí mrtvého a tři životy zabijí všechny tři; Pijavice nezemře, dokud žije hostitel, a zemře s ním; Ojo – v kroku vybereš postavu a její hráč zemře; Lil' Monsta nikdo nedostane (o Přisluhovače víc), Přisluhovači se v noci budí vybrat, kdo ji hlídá; Legie jde do pytlíku vícekrát a pro Vyšetřovatele je i Přisluhovač; Pán bouře – zlí se při rozdání posadí do řady kolem něj (jinde je v Přípravě tlačítko); Kazali – kolik Přisluhovačů vytvoří; 3. den se z Přisluhovačů stane Riot; Leviathan – počítá dny a popravené dobré hráče. Ve dne jsou ve středu kruhu jejich pravidla pro ten den.",
        href: "/admin/grimoary",
      },
      {
        for: "organizers",
        text: "Grimoár: změna postavy hráče během hry (Kazali, Ježibaba…) se zapíše do kroniky; žeton položený znovu na stejného hráče další noc platí pro tuto noc.",
      },
      {
        for: "organizers",
        text: "Grimoár, Přisluhovači: Travičův jed a opilost od Cvičitele opic, Námořníka a Hostinského platí jen do soumraku (pak žeton zmizí), stejně prokletí Čarodějnice; žeton „Mrtvý“ Kmotra v noci zabije (Mnich ani Voják před ním nechrání, Hostinský, Námořník a Šašek ano) a Nájemného vraha zabije vždy, i Pijavici; Vezír ve dne nezemře, stejně hráč Ďáblova advokáta; komu Mezefeles obrátil stranu („Turns evil“), je zlý i pro Kuchaře a Empata; na noc X Xaana jsou Měšťané otrávení; Démon se budí i v kroku postavy, jejíž schopnost mu dal Boffin (vybereš u Boffina). Ve dne střed kruhu připomene Čarodějnici, Strůjce, Zlé dvojče, Boomdandyho a Skřeta.",
        href: "/admin/grimoary",
      },
      { for: "players", text: "Odehrané hry: u Boffina je vidět, čí schopnost dal Démonovi, u Alchymisty, čí schopnost měl.", href: "/botc/archiv" },
      {
        for: "organizers",
        text: "Grimoár, Podivíni: žeton „Mrtvý“ v noci zabíjí u všech postav (Dítě měsíce a Vlkodlak jen dobrého hráče, Dráteník, Drbna, Gambler, Akrobat…) – Mnich a Voják před tím nechrání, Hostinský, Námořník a Šašek ano; kdo první v noci vybere Hňupa, je do soumraku opilý a jeho volba nic neudělá; Zlobr je na straně svého přítele (i pro Kuchaře a Empata); Poustevník má schopnosti Podivínů ze scriptu (budí se u nich, jeví se jako Samotář); Blázen hraje Démona jen ve svém kroku. V noci připomene Holiče, Kloboučníka, Zlatíčko a Dítě měsíce, ve dne popraveného Světce, Nešiku, Dítě měsíce, Zlatíčko a Sluhova pána, při konci hry Heretika a Politika.",
        href: "/admin/grimoary",
      },
      {
        for: "organizers",
        text: "Grimoár, Měšťané: Námořník a Šašek (poprvé) nezemřou ani při popravě, sousedé Čajové dámy se počítají sami (oba dobří = nemůžou zemřít); Babička zemře se zabitým vnoučetem; postava, kterou si vzal Filozof, je opilá; Přisluhovač na kázání Kazatele nemá schopnost; opilost od Lichotníka trvá 3 noci a 3 dny; Zaklínač hadů, který vybere Démona, si s ním prohodí postavu; Kanibal se budí jako poslední popravený (zlý = otrávený); Alchymista má schopnost Přisluhovače (vybereš u něj). Spočítá Hodináře, Věštce, Shugenju a Hrobníka (i se Špehem a Samotářem), u Vědmy kdo je pro ni Démon, u Strážkyně krkavců, Mudrce, Zpěváčka, Krále a Farmáře co dělat. U Démona upozorní na Exorcistu, Princeznu, Vlkodlaka a útok na Starostu, u infa pro zlé na Kouzelníka a Makovou panenku, ve dne na Ateistu, Starostu se 3 živými, Pacifistu, Pannu a Smrtonošku.",
        href: "/admin/grimoary",
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
