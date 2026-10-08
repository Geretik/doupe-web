# DoUPě Olomouc – web klubu deskových her

Web **Klubu deskových her DoUPě Olomouc**. Úvodní stránka je o klubu, jednotlivé části klubu
jsou moduly s vlastní adresou a menu. Sbírka her klubu je podstránka klubu `/hry` (odkaz z úvodní stránky, v menu zůstává zvýrazněný Klub). Modul je zatím jen jeden: **Blood on the Clocktower** („Krvavka“)
pod `/botc`, registrace na herní večery bez uživatelských účtů. Hráč vyplní formulář, na e-mail
dostane potvrzení s tajným odkazem, přes který může registraci upravit nebo zrušit.

## Stack

- [Next.js](https://nextjs.org) (App Router, Server Actions), TypeScript, Tailwind CSS
- Postgres přes [Drizzle ORM](https://orm.drizzle.team) (`pg` driver – funguje s Neon, Vercel Postgres, Supabase i lokálním Postgresem)
- E-maily přes [Resend](https://resend.com)
- Nasazení na Vercel

## Funkce

- Dvojjazyčné rozhraní **česky / English** včetně adminu (přepínač v hlavičce, volba se ukládá do cookie, e-maily chodí v jazyce hráče)

- `/` – o klubu: kdy a kde se hraje, pravidla, přihlašování na klubová hraní (zatím přes Discord)
- `/hry` – sbírka her klubu s hledáním (i v poznámkách, bez ohledu na diakritiku) a filtry (počet hráčů, jen klubové, bez rozšíření). Seznam se upravuje jen na [Zatrolených hrách](https://www.zatrolene-hry.cz/klub/klub-deskovych-her-doupe-olomouc-58/). Jejich API sbírky klubů neumí a Cloudflare před nimi odmítá požadavky ze serverů (Vercel, GitHub Actions), takže web si ho sám nenačte: po úpravě na Zatrolených hrách spusť u sebe `npm run hry`, který přečte veřejnou stránku klubu (`src/lib/zatrolene.ts`), uloží seznam do `src/data/game-collection.json` a vypíše, co přibylo a ubylo. Na web se dostane s dalším nasazením (commit a push).
- `/botc` – Krvavka: seznam nadcházejících termínů s počtem volných míst, náhradníků a jazykem hry; stránky modulu mají vlastní menu (Termíny · O hře · Archiv · Moje hry)
- `/botc/termin/[id]` – detail termínu a registrační formulář (jméno, příjmení, přezdívka, e-mail, telefon, volitelný příchod/odchod, „můžu dělat vypravěče“, „jsem nováček“); telefon vidí jen organizátoři
- `/botc/termin/[id]/kalendar.ics` – termín jako soubor do kalendáře; odkaz i na Google Kalendář je na stránce termínu a v e-mailech
- `/kalendar.ics` – veřejný iCal feed všech termínů (odběr kalendáře); zůstává na nejvyšší úrovni, ať odebírané kalendáře nemusí řešit přesměrování
- `/botc/archiv` – proběhlé večery s odehranými scripty a počtem hráčů
- `/botc/o-hre` – o hře Blood on the Clocktower
- `/ochrana-udaju` – zásady ochrany osobních údajů (co se sbírá, zpracovatelé, mazání po 14 dnech, práva); v adminu u hráče 🗑️ smaže na žádost všechny jeho údaje ve všech registracích
- `/botc/r/[token]` – úprava / zrušení registrace přes odkaz z e-mailu
- Staré adresy z doby, kdy byl web jen pro Krvavku (`/termin/…`, `/r/…`, `/moje-hry/…`, `/archiv`, `/o-hre`, `/klub`; samotné `/termin` vede na `/botc`), trvale přesměrují na nové (`next.config.ts`), takže fungují odkazy z odeslaných e-mailů, Discordu i QR kódy na vytištěných plakátech
- `/admin` – přehled klubu: nejbližší termíny, drafty, kde je organizátor na tahu, jeho rozehrané grimoáry, poslední novinky a stránky klubu (účty organizátorů s hashovanými hesly, role správce / organizátor)
- `/admin/botc` – Krvavka v adminu: správa termínů a přehled přihlášených (`/admin/botc/termin/[id]`), statistiky, drafty, scripty a grimoáry pod `/admin/botc/…`. Staré adresy z doby, kdy byly přímo pod `/admin` (`/admin/termin/…`, `/admin/drafty/…`, `/admin/grimoary/…`, `/admin/scripty/…`, `/admin/statistiky`, `/admin/novy`), trvale přesměrují na nové (`next.config.ts`), takže fungují odkazy z odeslaných e-mailů i záložky
- `/admin/ucty` – účty a pozvánky (jen správce): pozvánka vygeneruje jednorázový odkaz, na kterém si nový organizátor založí účet
- Přihlášení do adminu: po 10 špatných pokusech z jedné sítě se na 15 minut odmítá (i se správným heslem); počítá se i heslo ze serveru při zakládání prvního účtu a současné heslo při jeho změně, správné přihlášení mezi tím dřívější špatné pokusy nesmaže. Každá chráněná stránka adminu ověřuje přihlášení sama (ne jen layout, který se při navigaci nevykresluje znovu).
- Hesla organizátorů: `/admin/heslo` – změna vlastního hesla; zapomenuté heslo – na přihlašovací stránce „Zapomenuté heslo?“ (`/admin/zapomenute-heslo`) pošle na e-mail účtu jednorázový odkaz `/admin/nove-heslo/…` (platí 2 hodiny; odpověď je stejná, ať účet existuje, nebo ne), případně ho správce vytvoří v `/admin/ucty` (platí 3 dny). Změna i obnova hesla odhlásí účet na ostatních zařízeních. Když nefunguje e-mail a heslo zapomene jediný správce, viz `scripts/reset-link.mjs` níže.
- Bezpečnostní hlavičky (`next.config.ts`): web se nedá vložit do cizí stránky (rámeček), stránky s tajným odkazem v adrese ho neposílají dál při prokliku ven
- Hlídání nastavení: hlavní stránka adminu upozorní, když chybí `CRON_SECRET` nebo `CONTACT_EMAIL` nebo když denní úlohy neproběhly déle než 26 hodin (s odkazem „Spustit teď“)
- Hráči: poznámka pro organizátory, výběr příchodu/odchodu po 15 minutách v rámci termínu, zrušení s důvodem, stránka `/botc/moje-hry` (odkaz na přehled registrací e-mailem; stejně jako zapomenuté heslo nejvýš jeden e-mail na adresu za 10 minut a 10 žádostí za hodinu z jedné sítě), sdílení termínu, PWA
- Registrace u termínu: otevřené / zatím neotevřené (termín je vidět, přihlásit se ještě nejde) / pozastavené; v adminu jedním kliknutím „Otevřít“ / „Pozastavit“, server nové registrace mimo „otevřené“ odmítne, přihlášení mohou dál upravovat a rušit
- Časované otevření registrací: u zavřeného termínu čas „Automaticky otevřít“; stav se vyhodnocuje při každém požadavku (bez cronu), otevřená stránka termínu si v tu chvíli sama načte formulář
- QR kód termínu: `/botc/termin/[id]/qr.svg` a `qr.png` (odkaz na registraci), v adminu tisknutelný plakát A4 `/admin/botc/termin/[id]/plakat`
- Organizátoři: jazyk hry u každého termínu (čeština / angličtina / obojí – hráči ho vidí u termínu, v potvrzovacím e-mailu a v oznámení na Discordu), přehled „kolik lidí bude v kterou hodinu“ podle příchodů a odchodů, vypravěč u termínu, playlist k termínu (v adminu se vloží zkopírovaná tabulka skladeb i s odkazy ke stažení – z dokumentu, tabulky, webu nebo chatu; hráči ho vidí u termínu na rozkliknutí), opakující se termíny, evidence odehraných her (archiv, statistiky), soukromý iCal `/admin/kalendar.ics?key=…` (každý organizátor má vlastní odkaz, jde vyměnit za nový a se smazáním účtu přestane fungovat), ✉️ nové poslání odkazu hráči, ⚠️ u registrací bez potvrzení
- Automatika: 14 dní po termínu se hráčům smaže jméno, e-mail a telefon (zůstane přezdívka, docházka, poznámka a důvod odhlášení; e-mail nahradí pseudonym, aby statistiky poznaly stejného hráče), volitelně Discord post „zbývá míst“ dva dny před hrou (`DISCORD_SPOTS_LEFT=1`), upozornění organizátorům (e-mail + Discord) při pozdním odhlášení přihlášeného hráče (<24 h), selhání e-mailu nebo cronu; denní cron také posune náhradníky na volná místa, kdyby to po odhlášení selhalo; limit registrací z jedné sítě (`REGISTRATION_RATE_LIMIT`, výchozí 10/h)
- Hlasování o scriptu: organizátor u termínu nabídne scripty (odkaz je nepovinný), přihlášení hráči i náhradníci na odkazu ke své registraci zaškrtnou, co by chtěli hrát (klidně víc), a hlas můžou měnit. Hlasuje se do začátku termínu, nebo dokud ho organizátor v adminu neukončí (jde i znovu otevřít). U termínu jsou veřejně jen počty hlasů, v adminu i kdo jak hlasoval. Pozvánka s odkazem je v potvrzovacím e-mailu, e-mailu náhradníkovi a v připomínce, dokud hlasování běží; kdo se přihlásil dřív, dostane odkaz hromadným e-mailem. Nabídka se při duplikaci termínu zkopíruje, hlasy ne.
- `/admin/botc/statistiky` – obsazenost, docházka, pravidelní hráči
- `/admin/botc/scripty` – knihovna scriptů klubu: JSON (soubor nebo vložený text) ze script toolu, botcscripts.com či oficiální aplikace. Vidí ji všechny účty, upravit nebo smazat script může ten, kdo ho přidal, a správci. Název a autor se zapíšou do `_meta` souboru, postavy, které web nezná (Fabled, homebrew), zůstávají v JSONu. U scriptu: postavy po týmech, „Otevřít ve script toolu“, stažení JSONu. Formulář termínu nabízí scripty z knihovny i v hlasování a odkaz do script toolu doplní sám (`src/modules/botc/lib/scripts.ts`)
- `/api/cron/reminders` – denní připomínky (Vercel Cron, viz níže)

Náhradníci:
- Když je termín plný, hráč se zapíše jako **náhradník** a dostane e-mail s pořadím.
- Jakmile se někdo odhlásí (sám nebo přes admina) nebo admin zvýší kapacitu, první náhradník v pořadí je automaticky přesunut mezi přihlášené a dostane e-mail „uvolnilo se místo“.
- Dokud někdo čeká jako náhradník, noví zájemci se řadí za něj (fronta má přednost před volným místem).
- Admin může náhradníka potvrdit ručně i nad kapacitu.

Admin navíc umí: export přihlášených do CSV, hromadný e-mail všem přihlášeným (volitelně i náhradníkům),
duplikaci termínu (předvyplněný formulář o týden později, u staršího termínu na nejbližší stejný den v týdnu), označení docházky (dorazil / nedorazil),
ruční odeslání připomínky a oznámení termínu na Discord.

Pravidla:
- Jeden e-mail může mít na jeden termín jen jednu aktivní registraci. Při opakovaném pokusu se znovu pošle editační odkaz.
- Kapacita se kontroluje v transakci se zámkem řádku termínu, takže se nedá překročit ani při souběžných registracích.
- Zrušená registrace uvolní místo. Při nové registraci stejným e-mailem se obnoví s novým tokenem.
- Formulář obsahuje honeypot pole proti botům.
- E-maily se nikdy neposílají dvakrát: potvrzení jde jednou na každou (re)aktivaci registrace, opakované "už jsi registrovaný" nejdřív po 10 minutách, připomínka nejvýš jednou na registraci. Úprava ani zrušení registrace e-mail neposílají (zrušení může poslat e-mail *náhradníkovi*, který místo dostal).
- Připomínka „zítra je hra“ odchází hráčům termínů, které začínají do 36 hodin. Cron běží denně v 8:00 UTC (`vercel.json`), takže e-mail přijde den před hrou dopoledne.
- Časy se zobrazují i zadávají v časové zóně `Europe/Prague`.

## Kód

- `src/app` – stránky (Next.js App Router); Krvavka má veřejné stránky pod `src/app/botc`, admin pod `src/app/admin/(protected)/botc`
- `src/modules/botc` – modul Krvavky: `lib` (postavy, termíny a přihlášky, čekací listina, připomínky, statistiky, scripty, drafty, grimoár…), `components` a server akce `actions`
- `src/lib`, `src/components`, `src/app/actions` – společné části webu klubu: účty a přihlášení, e-mail, Discord, denní úlohy, texty webu, ochrana údajů
- `src/i18n` – texty obou jazyků (i Krvavky), `src/db/schema.ts` – celé schéma databáze

## Lokální vývoj

```bash
cp .env.example .env.local   # doplň hodnoty
npm install
npm run db:push              # vytvoří tabulky v databázi
npm run dev
```

Bez `RESEND_API_KEY` se e-maily neposílají, jen se vypisují do konzole serveru (včetně editačního odkazu).

Admin: `/admin/login`. Při prvním spuštění (žádný účet) stránka nabídne založení prvního účtu správce chráněné heslem `ADMIN_PASSWORD`; další účty vznikají přes pozvánky v `/admin/ucty`. Hesla se ukládají jako scrypt hash.

## Proměnné prostředí

| Název | Popis |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `RESEND_API_KEY` | API klíč Resend (prázdné = e-maily jen do logu) |
| `EMAIL_FROM` | Odesílatel, např. `Blood on the Clocktower CZ <registrace@tvojedomena.cz>` (doména musí být ověřená v Resend) |
| `EMAIL_REDIRECT_TO` | Volitelné. Ve vývoji bez ověřené domény: všechny e-maily se doručí na tuto adresu (Resend v testovacím režimu posílá jen na e-mail vlastníka účtu), původní příjemce je uveden v předmětu a těle. V produkci nenastavovat. |
| `NEXT_PUBLIC_SITE_URL` | Veřejná URL webu pro odkazy v e-mailech, bez lomítka na konci |
| `ADMIN_PASSWORD` | Bootstrap heslo, slouží jen k založení prvního účtu správce |
| `NEXT_PUBLIC_SITE_NAME` | Název webu v hlavičce, e-mailech a kalendářích (výchozí „DoUPě Olomouc“) |
| `ADMIN_SECRET` | Náhodný řetězec (`openssl rand -hex 32`) pro podpis admin cookie a odkazů „moje hry“, pseudonymů hráčů po smazání údajů a otisků IP a e-mailů. **Neměň ho:** všichni organizátoři se odhlásí, rozeslané odkazy „moje hry“ přestanou fungovat a statistiky pravidelných hráčů přestanou poznávat stejné hráče ze starších termínů. |
| `CRON_SECRET` | Tajemství pro cron připomínek; Vercel ho posílá automaticky v hlavičce `Authorization: Bearer …` (`openssl rand -hex 32`) |
| `DISCORD_WEBHOOK_URL` | Volitelné. Webhook Discord kanálu pro oznámení nových termínů (bez něj se tlačítka jen hlásí, že Discord není nastavený) |
| `DISCORD_SPOTS_LEFT` | Volitelné. `1` = denní úloha navíc pošle do stejného kanálu „zbývá X míst“ dva dny před hrou, která není plná. Bez něj se posílají jen oznámení nových termínů. |
| `DISCORD_ALERTS_WEBHOOK_URL` | Volitelné. Webhook **neveřejného** kanálu organizátorů pro upozornění (pozdní odhlášení s přezdívkou a důvodem, selhání e-mailu nebo cronu). Bez něj chodí upozornění jen e-mailem. |
| `CONTACT_EMAIL` | Doporučené. Schránka organizátorů: Reply-To všech e-mailů (adresa odesílatele nemá schránku) a kontakt na stránce `/ochrana-udaju` (bez ní se odkazuje na Discord) |

## Nasazení na Vercel

1. Importuj repozitář do Vercelu.
2. V Marketplace přidej **Neon** (nebo jiný Postgres) – Vercel nastaví `DATABASE_URL` automaticky.
3. Přidej integraci **Resend**, ověř doménu a nastav `RESEND_API_KEY` a `EMAIL_FROM`.
4. Nastav `NEXT_PUBLIC_SITE_URL`, `ADMIN_PASSWORD`, `ADMIN_SECRET`, `CRON_SECRET` (a případně `DISCORD_WEBHOOK_URL`).
   Cron pro připomínky je definovaný v `vercel.json`; Vercel ho po deployi zapne sám (na Hobby plánu běží jednou denně).
5. Vytvoř tabulky: lokálně s produkčním `DATABASE_URL` spusť `npm run db:push`
   (nebo použij `npm run db:generate` + `npm run db:migrate` pro migrace).
6. Deploy. Pak na `/admin/login` založ první účet správce (heslo z `ADMIN_PASSWORD`) a vypiš první termín.

## Testy

End-to-end testy (Playwright) běží proti produkčnímu buildu a **embedded Postgresu (PGlite)**, takže nepotřebují žádnou externí databázi ani účty. E-maily se v testech jen logují.

```bash
npx playwright install chromium   # jednorázově
npm test                          # build + e2e
npm run test:e2e                  # jen e2e (po předchozím buildu)
```

## CI a nasazení

Workflow `.github/workflows/ci.yml`:

1. **test** – na každý push i PR: lint, typecheck, build, e2e testy. Při selhání je report Playwrightu k dispozici jako artifact.
2. **deploy** – jen na `main` a jen po úspěšných testech: aplikuje schéma DB (`drizzle-kit push`) a nasadí produkci přes Vercel CLI.

Potřebné GitHub secrets: `VERCEL_TOKEN` (vytvoř na vercel.com/account/tokens), `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (z `.vercel/project.json`), `DATABASE_URL` (nepoolované připojení pro migrace).

## Skripty

- `npm run dev` / `build` / `start` / `lint`
- `npm run hry` – načte sbírku her ze Zatrolených her do `src/data/game-collection.json` (spouští se z vlastního počítače, viz `/hry` výše)
- `npm test` – build a e2e testy, `npm run test:e2e` – jen testy
- `npm run db:push` – synchronizuje schéma do DB (vhodné pro vývoj a malé projekty)
- `npm run db:generate`, `npm run db:migrate` – SQL migrace
- `npm run db:studio` – Drizzle Studio pro prohlížení dat
- `node scripts/reset-link.mjs <e-mail>` – jednorázový odkaz na nové heslo, když se nemůže přihlásit žádný správce (s produkčním `DATABASE_URL` v `.env.local`)
- `node scripts/migrate-db.mjs counts|copy|sync` – přesun dat do nové databáze
