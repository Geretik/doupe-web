# Blood on the Clocktower CZ – registrace na herní večery

Registrační web pro **Blood on the Clocktower** herní večery v Olomouci. Bez uživatelských účtů:
hráč vyplní formulář, na e-mail dostane potvrzení s tajným odkazem, přes který může
registraci upravit nebo zrušit.

## Stack

- [Next.js](https://nextjs.org) (App Router, Server Actions), TypeScript, Tailwind CSS
- Postgres přes [Drizzle ORM](https://orm.drizzle.team) (`pg` driver – funguje s Neon, Vercel Postgres, Supabase i lokálním Postgresem)
- E-maily přes [Resend](https://resend.com)
- Nasazení na Vercel

## Funkce

- Dvojjazyčné rozhraní **česky / English** včetně adminu (přepínač v hlavičce, volba se ukládá do cookie, e-maily chodí v jazyce hráče)

- `/` – seznam nadcházejících termínů s počtem volných míst a náhradníků
- `/termin/[id]` – detail termínu a registrační formulář (jméno, příjmení, přezdívka, e-mail, telefon, volitelný příchod/odchod, „můžu dělat vypravěče“, „jsem nováček“); telefon vidí jen organizátoři
- `/termin/[id]/kalendar.ics` – termín jako soubor do kalendáře; odkaz i na Google Kalendář je na stránce termínu a v e-mailech
- `/kalendar.ics` – veřejný iCal feed všech termínů (odběr kalendáře)
- `/archiv` – proběhlé večery s odehranými scripty a počtem hráčů
- `/klub` – o klubu: kdy a kde se hraje, pravidla, přihlašování na klubová hraní (zatím přes Discord)
- `/ochrana-udaju` – zásady ochrany osobních údajů (co se sbírá, zpracovatelé, mazání po 14 dnech, práva); v adminu u hráče 🗑️ smaže na žádost všechny jeho údaje ve všech registracích
- `/r/[token]` – úprava / zrušení registrace přes odkaz z e-mailu
- `/admin` – správa termínů a přehled přihlášených (účty organizátorů s hashovanými hesly, role správce / organizátor)
- `/admin/ucty` – účty a pozvánky (jen správce): pozvánka vygeneruje jednorázový odkaz, na kterém si nový organizátor založí účet
- Hráči: poznámka pro organizátory, výběr příchodu/odchodu po 15 minutách v rámci termínu, zrušení s důvodem, stránka `/moje-hry` (odkaz na přehled registrací e-mailem), sdílení termínu, PWA
- Registrace u termínu: otevřené / zatím neotevřené (termín je vidět, přihlásit se ještě nejde) / pozastavené; v adminu jedním kliknutím „Otevřít“ / „Pozastavit“, server nové registrace mimo „otevřené“ odmítne, přihlášení mohou dál upravovat a rušit
- Organizátoři: přehled „kolik lidí bude v kterou hodinu“ podle příchodů a odchodů, vypravěč u termínu, opakující se termíny, rozdělení ke stolům (auto + ručně, e-mail hráčům), evidence odehraných her (archiv, statistiky), soukromý iCal `/admin/kalendar.ics?key=…`, ✉️ nové poslání odkazu hráči, ⚠️ u registrací bez potvrzení
- Automatika: 14 dní po termínu se hráčům smaže jméno, e-mail a telefon (zůstane přezdívka, docházka, poznámka a důvod odhlášení; e-mail nahradí pseudonym, aby statistiky poznaly stejného hráče), Discord post „zbývá míst“ dva dny před hrou, upozornění organizátorům (e-mail + Discord) při pozdním odhlášení (<24 h), selhání e-mailu nebo cronu; limit registrací z jedné sítě (`REGISTRATION_RATE_LIMIT`, výchozí 10/h)
- `/admin/statistiky` – obsazenost, docházka, pravidelní hráči
- `/api/cron/reminders` – denní připomínky (Vercel Cron, viz níže)

Náhradníci:
- Když je termín plný, hráč se zapíše jako **náhradník** a dostane e-mail s pořadím.
- Jakmile se někdo odhlásí (sám nebo přes admina) nebo admin zvýší kapacitu, první náhradník v pořadí je automaticky přesunut mezi přihlášené a dostane e-mail „uvolnilo se místo“.
- Dokud někdo čeká jako náhradník, noví zájemci se řadí za něj (fronta má přednost před volným místem).
- Admin může náhradníka potvrdit ručně i nad kapacitu.

Admin navíc umí: export přihlášených do CSV, hromadný e-mail všem přihlášeným (volitelně i náhradníkům),
duplikaci termínu (předvyplněný formulář o týden později), označení docházky (dorazil / nedorazil),
ruční odeslání připomínky a oznámení termínu na Discord.

Pravidla:
- Jeden e-mail může mít na jeden termín jen jednu aktivní registraci. Při opakovaném pokusu se znovu pošle editační odkaz.
- Kapacita se kontroluje v transakci se zámkem řádku termínu, takže se nedá překročit ani při souběžných registracích.
- Zrušená registrace uvolní místo. Při nové registraci stejným e-mailem se obnoví s novým tokenem.
- Formulář obsahuje honeypot pole proti botům.
- E-maily se nikdy neposílají dvakrát: potvrzení jde jednou na každou (re)aktivaci registrace, opakované "už jsi registrovaný" nejdřív po 10 minutách, připomínka nejvýš jednou na registraci. Úprava ani zrušení registrace e-mail neposílají (zrušení může poslat e-mail *náhradníkovi*, který místo dostal).
- Připomínka „zítra je hra“ odchází hráčům termínů, které začínají do 36 hodin. Cron běží denně v 8:00 UTC (`vercel.json`), takže e-mail přijde den před hrou dopoledne.
- Časy se zobrazují i zadávají v časové zóně `Europe/Prague`.

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
| `ADMIN_SECRET` | Náhodný řetězec pro podpis admin cookie (`openssl rand -hex 32`) |
| `CRON_SECRET` | Tajemství pro cron připomínek; Vercel ho posílá automaticky v hlavičce `Authorization: Bearer …` (`openssl rand -hex 32`) |
| `DISCORD_WEBHOOK_URL` | Volitelné. Webhook Discord kanálu pro oznámení nových termínů (bez něj se tlačítka jen hlásí, že Discord není nastavený) |
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
- `npm test` – build a e2e testy, `npm run test:e2e` – jen testy
- `npm run db:push` – synchronizuje schéma do DB (vhodné pro vývoj a malé projekty)
- `npm run db:generate`, `npm run db:migrate` – SQL migrace
- `npm run db:studio` – Drizzle Studio pro prohlížení dat
