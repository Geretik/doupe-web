import Link from "next/link";
import type { Locale } from "@/i18n/dictionaries";
import { H2, Ul } from "@/components/prose";
import { Card } from "@/components/ui";
import { CLUB_DISCORD_URL as DISCORD_URL } from "@/lib/site";

const MAP_URL = "https://maps.app.goo.gl/strUg6nAKamStgeB7";
const linkClass = "underline hover:text-accent";

/** Highlighted box: Discord is our main channel and, for now, where club game nights are signed up for. */
function DiscordBox({
  title,
  button,
  note,
  children,
}: {
  title: string;
  button: string;
  note: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 flex flex-col items-start gap-3 rounded-xl border border-accent/40 bg-accent/5 p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="leading-relaxed">{children}</p>
      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noreferrer"
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
      >
        {button}
      </a>
      <p className="text-sm text-muted">{note}</p>
    </section>
  );
}

/** Discord channel name; never broken at its hyphens. */
function Channel({ children }: { children: React.ReactNode }) {
  return <strong className="whitespace-nowrap">{children}</strong>;
}

function Czech() {
  return (
    <>
      <Card className="space-y-2">
        <p>
          <span aria-hidden className="mr-1.5">📅</span>
          Každé <strong>úterý</strong> a <strong>čtvrtek</strong> v <strong>16:30</strong>
        </p>
        <p>
          <span aria-hidden className="mr-1.5">📍</span>
          <a href={MAP_URL} target="_blank" rel="noreferrer" className={linkClass}>
            Přírodovědecká fakulta UP Olomouc
          </a>
          , učebna <strong>1.037</strong>
        </p>
      </Card>

      <DiscordBox
        title="Jsme na Discordu"
        button="Přidat se na Discord"
        note={
          <>
            Výjimkou je{" "}
            <Link href="/botc" className={linkClass}>
              Krvavka
            </Link>{" "}
            (Krvavá hodina odbila) – na tu se registruješ přímo tady na webu.
          </>
        }
      >
        <strong>Discord je náš hlavní komunikátor.</strong> Zatím se přes něj přihlašuješ i na
        klubová hraní.
      </DiscordBox>

      <H2>Na místě</H2>
      <Ul>
        <li>
          Při příchodu se <strong>čitelně zapiš do prezenční listiny</strong>. Když se v ní
          nenajdeš, zapiš se na první volný řádek na konci.
        </li>
        <li>
          K zapůjčení jsou{" "}
          <Link href="/hry" className={linkClass}>
            <strong>klubové i soukromé hry</strong>
          </Link>
          . Klubové si můžeš vzít i{" "}
          <strong>domů</strong> proti vratné záloze <strong>500 Kč</strong>.
        </li>
        <li>
          Všichni si <strong>tykáme</strong> – v klubu i na Discordu.
        </li>
      </Ul>

      <H2>Pravidla</H2>
      <ul className="mt-3 space-y-1.5 leading-relaxed">
        <li><span aria-hidden className="mr-1.5">👐</span>Vzájemný respekt a slušnost</li>
        <li><span aria-hidden className="mr-1.5">❌</span>Žádný spam a trolling</li>
        <li><span aria-hidden className="mr-1.5">🗑️</span>V klubu zachovej pořádek a čistotu</li>
      </ul>

      <H2>Na Discordu</H2>
      <Ul>
        <li>
          Nastav si na našem serveru <strong>stejnou přezdívku, jakou používáš v klubu</strong>,
          ať se poznáme a víme, na koho čekáme. V seznamu členů klikni pravým tlačítkem (nebo
          ťukni) na sebe → „Change Server Profile“. Změna platí jen pro náš server.
        </li>
        <li>
          Užitečné odkazy najdeš v kanálu <Channel>#🔗-užitečné-odkazy</Channel>, odpovědi na
          časté otázky v{" "}
          <Channel>#❓-časté-otázky</Channel>.
        </li>
      </Ul>
    </>
  );
}

function English() {
  return (
    <>
      <Card className="space-y-2">
        <p>
          <span aria-hidden className="mr-1.5">📅</span>
          Every <strong>Tuesday</strong> and <strong>Thursday</strong> at <strong>4:30 PM</strong>
        </p>
        <p>
          <span aria-hidden className="mr-1.5">📍</span>
          <a href={MAP_URL} target="_blank" rel="noreferrer" className={linkClass}>
            Faculty of Science, Palacký University Olomouc
          </a>
          , room <strong>1.037</strong>
        </p>
      </Card>

      <DiscordBox
        title="Find us on Discord"
        button="Join our Discord"
        note={
          <>
            <Link href="/botc" className={linkClass}>
              Blood on the Clocktower
            </Link>{" "}
            is the exception – you sign up for it right here on this site.
          </>
        }
      >
        <strong>Discord is our main communication channel.</strong> For now, it&apos;s also where
        you sign up for club game nights.
      </DiscordBox>

      <H2>At the club</H2>
      <Ul>
        <li>
          When you arrive, <strong>sign the attendance sheet legibly</strong>. If you can&apos;t
          find your name on it, write it on the first empty line at the end.
        </li>
        <li>
          You can borrow both{" "}
          <Link href="/hry" className={linkClass}>
            <strong>club and private games</strong>
          </Link>{" "}
          to play on-site. Club games
          can also be taken <strong>home</strong> for a refundable deposit of{" "}
          <strong>500 CZK</strong>.
        </li>
        <li>
          We&apos;re all on a <strong>first-name basis</strong>, at the club and on Discord.
        </li>
      </Ul>

      <H2>Rules</H2>
      <ul className="mt-3 space-y-1.5 leading-relaxed">
        <li><span aria-hidden className="mr-1.5">👐</span>Mutual respect and good manners</li>
        <li><span aria-hidden className="mr-1.5">❌</span>No spam or trolling</li>
        <li><span aria-hidden className="mr-1.5">🗑️</span>Keep the club tidy and clean</li>
      </ul>

      <H2>On Discord</H2>
      <Ul>
        <li>
          Please set your <strong>nickname on our server to the one you use at the club</strong>,
          so we recognise each other and know who we&apos;re waiting for. Open the member list,
          right-click (or tap) your name → “Change Server Profile”. It only changes your name on
          our server.
        </li>
        <li>
          Useful links are in <Channel>#🔗-useful-links</Channel>, answers to common questions
          in{" "}
          <Channel>#❓-faq</Channel>.
        </li>
      </Ul>
    </>
  );
}

export function ClubContent({ locale }: { locale: Locale }) {
  return locale === "en" ? <English /> : <Czech />;
}
