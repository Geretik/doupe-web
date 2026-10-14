import type { Locale } from "@/i18n/dictionaries";
import { H2, H3, P, Ul } from "@/components/prose";
import { ATTENDANCE_RETENTION_YEARS } from "@/lib/attendance";
import { LOAN_RETENTION_DAYS } from "@/lib/loans";
import { RETENTION_DAYS } from "@/lib/retention";
import { CLUB_DISCORD_URL, PRIVACY_SECTIONS, scriptToolUrl } from "@/lib/site";

const linkClass = "underline hover:text-accent";
const SCRIPT_TOOL = scriptToolUrl();

type Props = {
  /** CONTACT_EMAIL; without it players are pointed to the club's Discord */
  contact: string | null;
  /** organiser alerts (nicknames, cancel reasons) go to a Discord channel */
  discordAlerts: boolean;
};

function Contact({ contact, discord }: { contact: string | null; discord: string }) {
  return contact ? (
    <a href={`mailto:${contact}`} className={linkClass}>{contact}</a>
  ) : (
    <a href={CLUB_DISCORD_URL} target="_blank" rel="noreferrer" className={linkClass}>{discord}</a>
  );
}

function Czech({ contact, discordAlerts }: Props) {
  return (
    <>
      <H2>Kdo za údaje odpovídá</H2>
      <P>
        Web provozují organizátoři <strong>Klubu deskových her DoUPě Olomouc</strong>, studentské
        iniciativy při Přírodovědecké fakultě Univerzity Palackého v Olomouci. Klub nemá vlastní
        právní subjektivitu, o údaje se starají jeho organizátoři.
      </P>
      <P>
        S čímkoli ohledně svých údajů se na nás obrať: <Contact contact={contact} discord="napiš nám na Discordu" />.
      </P>

      <H2 id={PRIVACY_SECTIONS.botc}>Krvavka – přihlášky na hraní</H2>
      <P>Když se tu přihlásíš na hraní Blood on the Clocktower.</P>
      <H3>Jaké údaje a proč</H3>
      <Ul>
        <li>
          <strong>Přezdívka a e-mail</strong> (povinné) – abychom věděli, kdo přijde, a mohli ti poslat
          potvrzení, odkaz na úpravu registrace, připomínku a případné změny.
        </li>
        <li>
          <strong>Jméno, příjmení a telefon</strong> (nepovinné, telefon může být u některých termínů
          povinný) – abychom tě zastihli, když se něco změní na poslední chvíli.
        </li>
        <li>
          <strong>Čas příchodu a odchodu, zda umíš vyprávět, zda jsi nováček, poznámka pro organizátory
          a důvod odhlášení</strong> – kvůli plánování průběhu večera.
        </li>
        <li>
          <strong>Docházka</strong> – po hraní organizátoři zaznamenají, kdo přišel, kvůli statistikám klubu.
        </li>
        <li>
          <strong>Odehrané hry</strong> – organizátoři zapíšou, jakou postavu jsi v které hře hrál/a (nebo že jsi ji
          vyprávěl/a) a která strana vyhrála, pro archiv a statistiky klubu.
        </li>
        <li>
          <strong>Hlas o scriptu</strong> – když u termínu hlasuješ, které scripty bys chtěl/a hrát, aby
          organizátoři věděli, co připravit.
        </li>
        <li>
          <strong>Otisk IP adresy</strong> (samotnou adresu neukládáme) – ochrana proti hromadným falešným registracím.
        </li>
      </Ul>
      <P>
        Údaje zpracováváme, protože jsou potřeba k uspořádání hraní, na které se přihlašuješ
        (čl. 6 odst. 1 písm. b GDPR). Archiv a statistiky klubu a ochrana proti zneužití jsou náš oprávněný zájem
        (čl. 6 odst. 1 písm. f GDPR).
      </P>
      <H3>Kdo je uvidí</H3>
      <Ul>
        <li>
          Přezdívka je veřejně vidět v seznamu přihlášených u termínu, a když umíš vyprávět, je u ní 🎩.
        </li>
        <li>
          Po hraní je přezdívka veřejně vidět v archivu u odehraných her, s postavou, kterou jsi hrál/a, a stranou,
          která vyhrála.
        </li>
        <li>U hlasování o scriptu je veřejně vidět jen počet hlasů, kdo jak hlasoval, vidí organizátoři.</li>
        <li>Ostatní údaje vidí jen organizátoři Krvavky v administraci webu.</li>
      </Ul>
      <H3>Jak dlouho je máme</H3>
      <Ul>
        <li>
          <strong>Jméno, příjmení, e-mail, telefon a otisk IP adresy</strong> uchováváme od zadání do
          systému do uplynutí {RETENTION_DAYS} dní od konání hraní. Potom se automaticky smažou.
        </li>
        <li>
          Místo e-mailu zůstane pseudonymní kód, díky kterému statistiky poznají stejného hráče a v „Mých
          hrách“ uvidíš i starší odehrané hry. E-mail se z kódu přečíst nedá, ze stejné adresy ale vždy
          vyjde stejný kód, takže jde pořád o osobní údaj.
        </li>
        <li>
          Když si necháš poslat odkaz na „Moje hry“, uložíme na jeden den otisk e-mailu a IP adresy
          (ne adresy samotné), abychom mohli omezit, kolik odkazů odchází.
        </li>
        <li>
          <strong>Přezdívka, docházka, odehrané hry, časy, poznámka, důvod odhlášení a hlas o scriptu</strong> zůstávají
          v archivu a statistikách klubu, dokud nepožádáš o jejich smazání.
        </li>
      </Ul>
      <P>Přihlášku si můžeš sám/sama upravit nebo zrušit přes odkaz z potvrzovacího e-mailu.</P>

      <H2 id={PRIVACY_SECTIONS.attendance}>Prezenčka – klubové večery</H2>
      <P>Když se na klubovém večeru zapíšeš přes QR kód na stole.</P>
      <H3>Jaké údaje a proč</H3>
      <Ul>
        <li>
          <strong>Jméno, příjmení, zda máš vztah k Univerzitě Palackého</strong> (studuješ nebo pracuješ tam)
          <strong> a kdy ses zapsal/a</strong> – abychom věděli, kdo klub navštěvuje, a mohli to doložit fakultě,
          v jejíchž prostorách hrajeme.
        </li>
        <li>
          <strong>Otisk jména a IP adresy</strong> (ne jméno a adresa samotné) – abychom mohli omezit, kolik
          zápisů přijde z jedné sítě.
        </li>
        <li>
          <strong>Zapamatování na telefonu</strong> – když si to zaškrtneš, uloží se do cookie ve tvém prohlížeči
          tvoje jméno, příjmení, vztah k UP a náhodný klíč, aby ti příště stačilo jedno ťuknutí.
        </li>
      </Ul>
      <P>Prezenční listinu vedeme z oprávněného zájmu (čl. 6 odst. 1 písm. f GDPR).</P>
      <H3>Kdo je uvidí</H3>
      <Ul>
        <li>Listinu vidí jen organizátoři klubu v administraci webu.</li>
        <li>Při zapisování výpůjčky hry se jim z listiny našeptávají jména.</li>
      </Ul>
      <H3>Jak dlouho je máme</H3>
      <Ul>
        <li>
          <strong>Jméno a příjmení</strong> se automaticky smažou {ATTENDANCE_RETENTION_YEARS} roky po večeru.
          Zůstane jen den a vztah k UP, kvůli počtům návštěv.
        </li>
        <li>Otisk jména a IP adresy smažeme po jednom dni.</li>
        <li>
          Cookie zůstane jen v tvém prohlížeči 400 dní od posledního zápisu; smažeš ji na stránce prezenčky
          tlačítkem „To nejsem já“ nebo „Zapomenout“.
        </li>
      </Ul>

      <H2 id={PRIVACY_SECTIONS.loans}>Výpůjčky her</H2>
      <P>Když si od klubu půjčíš hru.</P>
      <Ul>
        <li>
          <strong>Tvoje jméno, kterou hru a kdy sis ji půjčil/a a vrátil/a</strong>, případně poznámka organizátora
          (třeba co v krabici chybí) – abychom věděli, kde naše hry jsou. Je to náš oprávněný zájem
          (čl. 6 odst. 1 písm. f GDPR).
        </li>
        <li>Výpůjčky vidí jen organizátoři klubu v administraci webu.</li>
        <li>
          <strong>Jméno u půjčené hry</strong> (i s poznámkou) se automaticky smaže {LOAN_RETENTION_DAYS} dní
          po vrácení hry.
        </li>
      </Ul>

      <H2 id={PRIVACY_SECTIONS.message}>Vzkaz</H2>
      <P>Když nám napíšeš přes formulář na úvodní stránce.</P>
      <Ul>
        <li>
          <strong>Jméno nebo přezdívka</strong> (nepovinné), <strong>e-mail a text vzkazu</strong> – abychom ti
          mohli odpovědět. Je to náš oprávněný zájem (čl. 6 odst. 1 písm. f GDPR).
        </li>
        <li>
          Vzkaz web neukládá, jen ho přepošle e-mailem organizátorům klubu. V jejich schránce zůstane, dokud
          ho nesmažou.
        </li>
        <li>
          Na jeden den uložíme otisk e-mailu a IP adresy (ne adresy samotné), abychom mohli omezit, kolik
          vzkazů odchází.
        </li>
      </Ul>

      <H2 id={PRIVACY_SECTIONS.scriptTool}>Script tool</H2>
      <P>
        Klubový script tool na <a href={SCRIPT_TOOL} className={linkClass}>skript.doupeol.cz</a> je naše kopie nástroje
        BoardGames Štefana Bačkora. Jeho původní stránka „Privacy &amp; cookies“ popisuje originál, pro naši kopii platí
        tohle:
      </P>
      <Ul>
        <li>
          <strong>Tvoje scripty, zvolený jazyk a rozdělané úpravy</strong> zůstávají jen v tvém prohlížeči (localStorage
          a sessionStorage), k nám ani nikam jinam se neposílají. Smažeš je smazáním dat stránky v prohlížeči.
        </li>
        <li>
          <strong>Žádná analytika.</strong> Google Analytics z originálu jsme z naší kopie odstranili, proto se ani
          neptá na souhlas s cookies.
        </li>
        <li>
          <strong>Sdílený script</strong> (i se jménem autora, pokud ho vyplníš) je celý zakódovaný v odkazu – uvidí ho
          každý, komu odkaz pošleš.
        </li>
        <li>
          Script tool běží na Vercelu jako zbytek webu a homebrew postavy si načítá z doupeol.cz. Obojí vede běžné
          záznamy o přístupech (logy), které mohou obsahovat IP adresu.
        </li>
        <li>
          Tlačítka <strong>Načíst z Doupěte</strong> a <strong>Uložit do Doupěte</strong> otevřou knihovnu scriptů
          v administraci webu, kam mají přístup jen organizátoři. Do knihovny se script dostane, jen když ho tam
          organizátor uloží.
        </li>
      </Ul>

      <H2>Komu údaje svěřujeme</H2>
      <P>
        Nikomu je neprodáváme ani nepředáváme pro jiné účely. Web běží na službách těchto firem, které pro nás
        údaje technicky zpracovávají:
      </P>
      <Ul>
        <li><strong>Vercel Inc.</strong> (USA) – provoz webu, server běží v USA.</li>
        <li><strong>Neon</strong> (součást Databricks, Inc., USA) – databáze, data jsou uložená v USA.</li>
        <li><strong>Resend</strong> (USA) – odesílání e-mailů, e-maily odcházejí ze serverů v Irsku.</li>
        {discordAlerts && (
          <li>
            <strong>Discord Inc.</strong> (USA) – do neveřejného kanálu organizátorů chodí upozornění,
            například o pozdním odhlášení (přezdívka a důvod).
          </li>
        )}
      </Ul>
      <P>
        Předávání do USA se opírá o rámec EU–USA pro ochranu osobních údajů (Data Privacy Framework)
        nebo o standardní smluvní doložky EU, které tyto služby používají.
      </P>

      <H2>Tvoje práva</H2>
      <P>
        Můžeš nás požádat o přehled údajů, které o tobě máme, o jejich opravu, smazání, omezení zpracování nebo
        předání v běžném strojově čitelném formátu, případně vznést námitku. Na požádání smažeme všechno dřív,
        včetně přezdívky a poznámek. Stížnost můžeš podat u{" "}
        <a href="https://uoou.gov.cz" target="_blank" rel="noreferrer" className={linkClass}>
          Úřadu pro ochranu osobních údajů
        </a>
        .
      </P>

      <H2>Cookies</H2>
      <P>
        Web nepoužívá analytické ani reklamní cookies. Ukládá jen zvolený jazyk, přihlášení
        organizátorů do administrace a – když si to zaškrtneš – zapamatování v{" "}
        <a href={`#${PRIVACY_SECTIONS.attendance}`} className={linkClass}>prezenčce</a>.
      </P>
    </>
  );
}

function English({ contact, discordAlerts }: Props) {
  return (
    <>
      <H2>Who is responsible</H2>
      <P>
        The site is run by the organisers of the <strong>DoUPě Olomouc board game club</strong>, a
        student initiative at the Faculty of Science of Palacký University Olomouc. The club is not
        a legal entity of its own; its organisers look after the data.
      </P>
      <P>
        For anything about your data, contact us: <Contact contact={contact} discord="write to us on Discord" />.
      </P>

      <H2 id={PRIVACY_SECTIONS.botc}>Blood on the Clocktower – signing up for a game</H2>
      <P>When you sign up here for a Blood on the Clocktower game night.</P>
      <H3>What we collect and why</H3>
      <Ul>
        <li>
          <strong>Nickname and e-mail</strong> (required) – so we know who is coming and can send you
          the confirmation, the link to change your sign-up, a reminder and any changes.
        </li>
        <li>
          <strong>First name, last name and phone</strong> (optional; some sessions require a phone) –
          so we can reach you when something changes at the last minute.
        </li>
        <li>
          <strong>Arrival and departure time, whether you can storytell, whether you are new, your note
          for the organisers and your cancel reason</strong> – to plan the evening.
        </li>
        <li>
          <strong>Attendance</strong> – after the game the organisers note who came, for the club&apos;s stats.
        </li>
        <li>
          <strong>Games played</strong> – the organisers record which character you played in which game (or that
          you were its Storyteller) and which side won, for the club&apos;s archive and stats.
        </li>
        <li>
          <strong>Your script vote</strong> – when you vote on which scripts you&apos;d like to play, so the
          organisers know what to prepare.
        </li>
        <li>
          <strong>A fingerprint of your IP address</strong> (not the address itself) – protection against
          mass fake sign-ups.
        </li>
      </Ul>
      <P>
        We process the data because it is needed to run the game night you sign up for (Art. 6(1)(b)
        GDPR). The club&apos;s archive and stats and protection against abuse are our legitimate interest (Art. 6(1)(f)
        GDPR).
      </P>
      <H3>Who can see it</H3>
      <Ul>
        <li>
          Your nickname is shown publicly in the list of players of the session, with a 🎩 when you can storytell.
        </li>
        <li>
          After the game your nickname is shown publicly in the archive with the games played, the character you
          played and the side that won.
        </li>
        <li>In a script vote only the number of votes is public; the organisers see who voted for what.</li>
        <li>Everything else is visible only to the Blood on the Clocktower organisers in the site&apos;s admin.</li>
      </Ul>
      <H3>How long we keep it</H3>
      <Ul>
        <li>
          <strong>First name, last name, e-mail, phone and the IP fingerprint</strong> are kept from the
          moment you enter them until {RETENTION_DAYS} days after the game. Then they are deleted
          automatically.
        </li>
        <li>
          Your e-mail is replaced by a pseudonymous code so the stats can recognise the same player and
          &quot;My games&quot; still shows your older games. The e-mail cannot be read back from the code,
          but the same address always gives the same code, so it still counts as personal data.
        </li>
        <li>
          When you ask for a &quot;My games&quot; link, we keep a fingerprint of the e-mail and of your IP
          address (not the addresses themselves) for one day, to limit how many links go out.
        </li>
        <li>
          <strong>Nickname, attendance, games played, times, note, cancel reason and script vote</strong> stay in the
          club&apos;s archive and stats until you ask us to delete them.
        </li>
      </Ul>
      <P>You can change or cancel your sign-up yourself through the link in the confirmation e-mail.</P>

      <H2 id={PRIVACY_SECTIONS.attendance}>The attendance sheet – club nights</H2>
      <P>When you sign in at a club night through the QR code on the table.</P>
      <H3>What we collect and why</H3>
      <Ul>
        <li>
          <strong>Your first and last name, whether you are related to Palacký University</strong> (you study or
          work there) <strong>and when you signed in</strong> – to know who comes to the club and to show it to the
          faculty whose rooms we play in.
        </li>
        <li>
          <strong>A fingerprint of your name and IP address</strong> (not the name and address themselves) – to
          limit how many entries come from one network.
        </li>
        <li>
          <strong>Remembering you on your phone</strong> – when you tick it, a cookie in your browser stores your
          name, relation to UP and a random key, so next time a single tap is enough.
        </li>
      </Ul>
      <P>We keep the attendance sheet as our legitimate interest (Art. 6(1)(f) GDPR).</P>
      <H3>Who can see it</H3>
      <Ul>
        <li>Only the club&apos;s organisers see the sheet, in the site&apos;s admin.</li>
        <li>When they write down a game loan, names from the sheet are suggested to them.</li>
      </Ul>
      <H3>How long we keep it</H3>
      <Ul>
        <li>
          <strong>First and last names</strong> are deleted automatically {ATTENDANCE_RETENTION_YEARS} years after
          the night. Only the day and the relation to UP stay, for the number of visits.
        </li>
        <li>The fingerprint of your name and IP address is deleted after one day.</li>
        <li>
          The cookie stays only in your browser, for 400 days after your last sign-in; you delete it on the
          attendance page with &quot;That&apos;s not me&quot; or &quot;Forget&quot;.
        </li>
      </Ul>

      <H2 id={PRIVACY_SECTIONS.loans}>Borrowing games</H2>
      <P>When you borrow a game from the club.</P>
      <Ul>
        <li>
          <strong>Your name, which game, when you took it and brought it back</strong>, and possibly the
          organiser&apos;s note (what&apos;s missing from the box, say) – so we know where our games are. This is our
          legitimate interest (Art. 6(1)(f) GDPR).
        </li>
        <li>Only the club&apos;s organisers see the loans, in the site&apos;s admin.</li>
        <li>
          <strong>Your name on a borrowed game</strong> (and the note with it) is deleted automatically{" "}
          {LOAN_RETENTION_DAYS} days after the game comes back.
        </li>
      </Ul>

      <H2 id={PRIVACY_SECTIONS.message}>Your message</H2>
      <P>When you write to us through the form on the home page.</P>
      <Ul>
        <li>
          <strong>Your name or nickname</strong> (optional), <strong>e-mail and the message</strong> – so we can
          reply. This is our legitimate interest (Art. 6(1)(f) GDPR).
        </li>
        <li>
          The site doesn&apos;t keep your message; it only e-mails it to the club&apos;s organisers. It stays in
          their mailbox until they delete it.
        </li>
        <li>
          We keep a fingerprint of the e-mail and of your IP address (not the addresses themselves) for one day, to
          limit how many messages go out.
        </li>
      </Ul>

      <H2 id={PRIVACY_SECTIONS.scriptTool}>The script tool</H2>
      <P>
        The club&apos;s script tool at <a href={SCRIPT_TOOL} className={linkClass}>skript.doupeol.cz</a> is our copy of
        Štefan Bačkor&apos;s BoardGames. Its own &ldquo;Privacy &amp; cookies&rdquo; page describes the original; for
        our copy this is what applies:
      </P>
      <Ul>
        <li>
          <strong>Your scripts, your language and unfinished edits</strong> stay in your browser (localStorage and
          sessionStorage) and are sent neither to us nor anywhere else. Clearing the site&apos;s data in your browser
          deletes them.
        </li>
        <li>
          <strong>No analytics.</strong> We removed the original&apos;s Google Analytics from our copy, so it does not
          ask for cookie consent either.
        </li>
        <li>
          <strong>A shared script</strong> (with the author&apos;s name, if you fill it in) is encoded in its link as a
          whole – anyone you send the link to can see it.
        </li>
        <li>
          The script tool runs on Vercel like the rest of the site and loads the homebrew characters from doupeol.cz.
          Both keep standard access logs, which may include IP addresses.
        </li>
        <li>
          The <strong>Load from Doupě</strong> and <strong>Save to Doupě</strong> buttons open the library of scripts in
          the site&apos;s admin, which only organisers can use. A script gets into the library only when an organiser
          saves it there.
        </li>
      </Ul>

      <H2>Who processes it for us</H2>
      <P>
        We don&apos;t sell or share your data for any other purpose. The site runs on services of these companies,
        which process the data for us technically:
      </P>
      <Ul>
        <li><strong>Vercel Inc.</strong> (USA) – hosting, the server runs in the USA.</li>
        <li><strong>Neon</strong> (part of Databricks, Inc., USA) – the database, stored in the USA.</li>
        <li><strong>Resend</strong> (USA) – sending e-mails, from servers in Ireland.</li>
        {discordAlerts && (
          <li>
            <strong>Discord Inc.</strong> (USA) – alerts to the organisers&apos; private channel, e.g. about
            a late cancellation (nickname and reason).
          </li>
        )}
      </Ul>
      <P>
        Transfers to the USA rely on the EU–US Data Privacy Framework or on the EU standard contractual
        clauses these services use.
      </P>

      <H2>Your rights</H2>
      <P>
        You can ask us what data we hold about you, to correct, delete or restrict it or to get it in a common
        machine-readable format, or object to its use. On request we delete everything sooner, including your
        nickname and notes. You can complain to the Czech{" "}
        <a href="https://uoou.gov.cz/en" target="_blank" rel="noreferrer" className={linkClass}>
          Office for Personal Data Protection
        </a>
        .
      </P>

      <H2>Cookies</H2>
      <P>
        The site uses no analytics or advertising cookies. It only stores your chosen language, the
        organisers&apos; admin login and – when you tick it – remembering you on the{" "}
        <a href={`#${PRIVACY_SECTIONS.attendance}`} className={linkClass}>attendance sheet</a>.
      </P>
    </>
  );
}

export function PrivacyContent({ locale, ...props }: Props & { locale: Locale }) {
  return locale === "en" ? <English {...props} /> : <Czech {...props} />;
}
