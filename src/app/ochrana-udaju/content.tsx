import type { Locale } from "@/i18n/dictionaries";
import { H2, P, Ul } from "@/components/prose";
import { ATTENDANCE_RETENTION_YEARS } from "@/lib/attendance";
import { LOAN_RETENTION_DAYS } from "@/lib/loans";
import { RETENTION_DAYS } from "@/lib/retention";
import { CLUB_DISCORD_URL } from "@/lib/site";

const linkClass = "underline hover:text-accent";

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

      <H2>Jaké údaje a proč</H2>
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
          <strong>Hlas o scriptu</strong> – když u termínu hlasuješ, které scripty bys chtěl/a hrát, aby
          organizátoři věděli, co připravit.
        </li>
        <li>
          <strong>Vzkaz</strong> – když nám napíšeš přes formulář na úvodní stránce: jméno nebo přezdívka
          (nepovinné), e-mail a text vzkazu, abychom ti mohli odpovědět.
        </li>
        <li>
          <strong>Prezenčka</strong> – když se na klubovém večeru zapíšeš přes QR kód na stole: jméno, příjmení, zda
          máš vztah k Univerzitě Palackého (studuješ nebo pracuješ tam, jsi absolvent/ka…) a kdy ses zapsal/a.
          Vedeme ji, abychom věděli, kdo klub navštěvuje, a mohli to doložit fakultě, v jejíchž prostorách hrajeme.
        </li>
        <li>
          <strong>Půjčování her</strong> – když si od klubu půjčíš hru: tvoje jméno, kterou hru a kdy sis ji půjčil/a
          a vrátil/a, případně poznámka organizátora (třeba co v krabici chybí), abychom věděli, kde naše hry jsou.
          Organizátorům se při zapisování výpůjčky našeptávají jména z prezenčky.
        </li>
        <li>
          <strong>Otisk IP adresy</strong> (samotnou adresu neukládáme) – ochrana proti hromadným falešným registracím.
        </li>
      </Ul>
      <P>
        Údaje zpracováváme, protože jsou potřeba k uspořádání hraní, na které se přihlašuješ
        (čl. 6 odst. 1 písm. b GDPR). Statistiky klubu, prezenční listina, půjčování her, odpovědi na vzkazy
        a ochrana proti zneužití jsou náš oprávněný zájem (čl. 6 odst. 1 písm. f GDPR).
      </P>

      <H2>Kdo údaje uvidí</H2>
      <Ul>
        <li>Přezdívka je veřejně vidět v seznamu přihlášených u termínu.</li>
        <li>U hlasování o scriptu je veřejně vidět jen počet hlasů, kdo jak hlasoval, vidí organizátoři.</li>
        <li>Ostatní údaje vidí jen organizátoři klubu v administraci webu.</li>
        <li>Vzkaz dostanou jen organizátoři klubu do své e-mailové schránky.</li>
        <li>Nikomu je neprodáváme ani nepředáváme pro jiné účely.</li>
      </Ul>

      <H2>Jak dlouho údaje máme</H2>
      <Ul>
        <li>
          <strong>Jméno, příjmení, e-mail, telefon a otisk IP adresy</strong> uchováváme od zadání do
          systému do uplynutí {RETENTION_DAYS} dní od konání hraní. Potom se automaticky smažou.
        </li>
        <li>
          Když si necháš poslat odkaz na „Moje hry“ nebo nám pošleš vzkaz, uložíme na jeden den otisk
          e-mailu a IP adresy (ne adresy samotné), abychom mohli omezit, kolik odkazů a vzkazů odchází.
          U prezenčky stejně tak otisk jména a IP adresy.
        </li>
        <li>
          <strong>Jméno a příjmení z prezenčky</strong> se automaticky smažou {ATTENDANCE_RETENTION_YEARS} roky po
          večeru. Zůstane jen den a vztah k UP, kvůli počtům návštěv.
        </li>
        <li>
          <strong>Jméno u půjčené hry</strong> (i s poznámkou) se automaticky smaže {LOAN_RETENTION_DAYS} dní
          po vrácení hry.
        </li>
        <li>
          <strong>Vzkaz</strong> web neukládá, jen ho přepošle e-mailem organizátorům. V jejich schránce
          zůstane, dokud ho nesmažou.
        </li>
        <li>
          Místo e-mailu zůstane pseudonymní kód, díky kterému statistiky poznají stejného hráče a v „Mých
          hrách“ uvidíš i starší odehrané hry. E-mail se z kódu přečíst nedá, ze stejné adresy ale vždy
          vyjde stejný kód, takže jde pořád o osobní údaj.
        </li>
        <li>
          <strong>Přezdívka, docházka, časy, poznámka, důvod odhlášení a hlas o scriptu</strong> zůstávají
          v archivu a statistikách klubu, dokud nepožádáš o jejich smazání.
        </li>
      </Ul>

      <H2>Komu údaje svěřujeme</H2>
      <P>Web běží na službách těchto firem, které pro nás údaje technicky zpracovávají:</P>
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
      <Ul>
        <li>
          Registraci si můžeš sám/sama upravit nebo zrušit přes odkaz z potvrzovacího e-mailu.
        </li>
        <li>
          Můžeš nás požádat o přehled údajů, které o tobě máme, o jejich opravu nebo smazání, případně
          vznést námitku. Na požádání smažeme všechno dřív, včetně přezdívky a poznámek.
        </li>
        <li>
          Pokud si myslíš, že s údaji nakládáme špatně, můžeš podat stížnost u{" "}
          <a href="https://uoou.gov.cz" target="_blank" rel="noreferrer" className={linkClass}>
            Úřadu pro ochranu osobních údajů
          </a>
          .
        </li>
      </Ul>

      <H2>Cookies</H2>
      <P>
        Web nepoužívá analytické ani reklamní cookies. Ukládá jen zvolený jazyk, přihlášení
        organizátorů do administrace a – když si to u prezenčky zaškrtneš – tvoje jméno, příjmení, vztah k UP
        a náhodný klíč, aby ti příště stačilo jedno ťuknutí. Tahle cookie zůstane jen v tvém prohlížeči 400 dní
        od posledního zápisu; smažeš ji na stránce prezenčky tlačítkem „To nejsem já“ nebo „Zapomenout“.
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

      <H2>What we collect and why</H2>
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
          <strong>Your script vote</strong> – when you vote on which scripts you&apos;d like to play, so the
          organisers know what to prepare.
        </li>
        <li>
          <strong>Your message</strong> – when you write to us through the form on the home page: your name
          or nickname (optional), e-mail and the message, so we can reply.
        </li>
        <li>
          <strong>The attendance sheet</strong> – when you sign in at a club night through the QR code on the
          table: your first and last name, whether you are related to Palacký University (you study or work there,
          graduated there…) and when you signed in. We keep it to know who comes to the club and to show it to the faculty
          whose rooms we play in.
        </li>
        <li>
          <strong>Borrowing a game</strong> – when you borrow a game from the club: your name, which game, when you
          took it and brought it back, and possibly the organiser&apos;s note (what&apos;s missing from the box, say),
          so we know where our games are. When the organisers write down a loan, names from the attendance sheet
          are suggested to them.
        </li>
        <li>
          <strong>A fingerprint of your IP address</strong> (not the address itself) – protection against
          mass fake sign-ups.
        </li>
      </Ul>
      <P>
        We process the data because it is needed to run the game night you sign up for (Art. 6(1)(b)
        GDPR). The club&apos;s stats, the attendance sheet, lending games, replying to messages and protection
        against abuse are our legitimate interest (Art. 6(1)(f) GDPR).
      </P>

      <H2>Who can see it</H2>
      <Ul>
        <li>Your nickname is shown publicly in the list of players of the session.</li>
        <li>In a script vote only the number of votes is public; the organisers see who voted for what.</li>
        <li>Everything else is visible only to the club&apos;s organisers in the site&apos;s admin.</li>
        <li>Your message goes only to the club&apos;s organisers&apos; mailbox.</li>
        <li>We don&apos;t sell or share your data for any other purpose.</li>
      </Ul>

      <H2>How long we keep it</H2>
      <Ul>
        <li>
          <strong>First name, last name, e-mail, phone and the IP fingerprint</strong> are kept from the
          moment you enter them until {RETENTION_DAYS} days after the game. Then they are deleted
          automatically.
        </li>
        <li>
          When you ask for a &quot;My games&quot; link or send us a message, we keep a fingerprint of the
          e-mail and of your IP address (not the addresses themselves) for one day, to limit how many
          links and messages go out. The same goes for your name and IP address on the attendance sheet.
        </li>
        <li>
          <strong>First and last names on the attendance sheet</strong> are deleted automatically{" "}
          {ATTENDANCE_RETENTION_YEARS} years after the night. Only the day and the relation to UP stay, for the
          number of visits.
        </li>
        <li>
          <strong>Your name on a borrowed game</strong> (and the note with it) is deleted automatically{" "}
          {LOAN_RETENTION_DAYS} days after the game comes back.
        </li>
        <li>
          The site doesn&apos;t keep <strong>your message</strong>; it only e-mails it to the organisers.
          It stays in their mailbox until they delete it.
        </li>
        <li>
          Your e-mail is replaced by a pseudonymous code so the stats can recognise the same player and
          &quot;My games&quot; still shows your older games. The e-mail cannot be read back from the code,
          but the same address always gives the same code, so it still counts as personal data.
        </li>
        <li>
          <strong>Nickname, attendance, times, note, cancel reason and script vote</strong> stay in the
          club&apos;s archive and stats until you ask us to delete them.
        </li>
      </Ul>

      <H2>Who processes it for us</H2>
      <P>The site runs on services of these companies, which process the data for us technically:</P>
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
      <Ul>
        <li>You can change or cancel your sign-up yourself through the link in the confirmation e-mail.</li>
        <li>
          You can ask us what data we hold about you, to correct or delete it, or object to its use. On
          request we delete everything sooner, including your nickname and notes.
        </li>
        <li>
          If you think we handle your data wrongly, you can complain to the Czech{" "}
          <a href="https://uoou.gov.cz/en" target="_blank" rel="noreferrer" className={linkClass}>
            Office for Personal Data Protection
          </a>
          .
        </li>
      </Ul>

      <H2>Cookies</H2>
      <P>
        The site uses no analytics or advertising cookies. It only stores your chosen language, the
        organisers&apos; admin login and – when you tick it on the attendance sheet – your name, relation to UP
        and a random key, so next time a single tap is enough. That cookie stays only in your browser, for 400
        days after your last sign-in; you delete it on the attendance page with &quot;That&apos;s not me&quot; or
        &quot;Forget&quot;.
      </P>
    </>
  );
}

export function PrivacyContent({ locale, ...props }: Props & { locale: Locale }) {
  return locale === "en" ? <English {...props} /> : <Czech {...props} />;
}
