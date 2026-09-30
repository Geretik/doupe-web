import type { Locale } from "@/i18n/dictionaries";
import { H2, P, Ul } from "@/components/prose";
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
          a důvod odhlášení</strong> – kvůli plánování stolů a průběhu večera.
        </li>
        <li>
          <strong>Docházka</strong> – po hraní organizátoři zaznamenají, kdo přišel, kvůli statistikám klubu.
        </li>
        <li>
          <strong>Otisk IP adresy</strong> (samotnou adresu neukládáme) – ochrana proti hromadným falešným registracím.
        </li>
      </Ul>
      <P>
        Údaje zpracováváme, protože jsou potřeba k uspořádání hraní, na které se přihlašuješ
        (čl. 6 odst. 1 písm. b GDPR). Statistiky klubu a ochrana proti zneužití jsou náš oprávněný
        zájem (čl. 6 odst. 1 písm. f GDPR).
      </P>

      <H2>Kdo údaje uvidí</H2>
      <Ul>
        <li>Přezdívka je veřejně vidět v seznamu přihlášených u termínu.</li>
        <li>Ostatní údaje vidí jen organizátoři klubu v administraci webu.</li>
        <li>Nikomu je neprodáváme ani nepředáváme pro jiné účely.</li>
      </Ul>

      <H2>Jak dlouho údaje máme</H2>
      <Ul>
        <li>
          <strong>Jméno, příjmení, e-mail, telefon a otisk IP adresy</strong> uchováváme od zadání do
          systému do uplynutí {RETENTION_DAYS} dní od konání hraní. Potom se automaticky smažou.
        </li>
        <li>
          Místo e-mailu zůstane anonymní kód, díky kterému statistiky poznají stejného hráče a v „Mých
          hrách“ uvidíš i starší odehrané hry. E-mail se z něj zjistit nedá.
        </li>
        <li>
          <strong>Přezdívka, docházka, časy, poznámka a důvod odhlášení</strong> zůstávají v archivu a
          statistikách klubu, dokud nepožádáš o jejich smazání.
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
        Web nepoužívá analytické ani reklamní cookies. Ukládá jen zvolený jazyk a přihlášení
        organizátorů do administrace.
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
          for the organisers and your cancel reason</strong> – to plan the tables and the evening.
        </li>
        <li>
          <strong>Attendance</strong> – after the game the organisers note who came, for the club&apos;s stats.
        </li>
        <li>
          <strong>A fingerprint of your IP address</strong> (not the address itself) – protection against
          mass fake sign-ups.
        </li>
      </Ul>
      <P>
        We process the data because it is needed to run the game night you sign up for (Art. 6(1)(b)
        GDPR). The club&apos;s stats and protection against abuse are our legitimate interest
        (Art. 6(1)(f) GDPR).
      </P>

      <H2>Who can see it</H2>
      <Ul>
        <li>Your nickname is shown publicly in the list of players of the session.</li>
        <li>Everything else is visible only to the club&apos;s organisers in the site&apos;s admin.</li>
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
          Your e-mail is replaced by an anonymous code so the stats can recognise the same player and
          &quot;My games&quot; still shows your older games. The e-mail cannot be recovered from it.
        </li>
        <li>
          <strong>Nickname, attendance, times, note and cancel reason</strong> stay in the club&apos;s
          archive and stats until you ask us to delete them.
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
        The site uses no analytics or advertising cookies. It only stores your chosen language and the
        organisers&apos; admin login.
      </P>
    </>
  );
}

export function PrivacyContent({ locale, ...props }: Props & { locale: Locale }) {
  return locale === "en" ? <English {...props} /> : <Czech {...props} />;
}
