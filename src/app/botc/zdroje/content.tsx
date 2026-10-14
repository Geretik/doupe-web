import type { Locale } from "@/i18n/dictionaries";
import { H2, P, Ul } from "@/components/prose";
import { homebrewCollections } from "@/modules/botc/lib/botc-roles";

const linkClass = "underline hover:text-accent";

const BOTC = "https://bloodontheclocktower.com/";
const WIKI = "https://wiki.bloodontheclocktower.com/";
const BOARDGAMES = "https://github.com/stefanbackor/boardgames";
const HOMEBREW_WIKI = "https://botchomebrew.wiki/";

function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
      {children}
    </a>
  );
}

/** Every homebrew collection the site knows, with its author: their characters and icons are theirs */
function Collections({ by }: { by: (author: string) => string }) {
  return (
    <Ul>
      {homebrewCollections.map((c) => (
        <li key={c.key} data-collection={c.key}>
          <Out href={c.url}>{c.name}</Out>
          {c.author && ` – ${by(c.author)}`}
        </li>
      ))}
    </Ul>
  );
}

function Czech({ scriptTool }: { scriptTool: string }) {
  return (
    <>
      <H2>Blood on the Clocktower</H2>
      <P>
        Blood on the Clocktower (česky Krvavá hodina odbila) vymyslel Steven Medway a vydává ji The Pandemonium
        Institute. Hra, její oficiální postavy, jejich texty i ikony jsou © The Pandemonium Institute. Doupě je klubový
        web fanoušků hry, s The Pandemonium Institute nijak nesouvisí.
      </P>
      <Ul>
        <li>
          <Out href={BOTC}>bloodontheclocktower.com</Out> – oficiální stránky hry
        </li>
        <li>
          <Out href={WIKI}>wiki.bloodontheclocktower.com</Out> – oficiální wiki, odtud jsou ikony postav
        </li>
      </Ul>

      <H2>Texty oficiálních postav</H2>
      <P>
        Jména, schopnosti, pořadí v noci, texty pro vypravěče, žetony připomínek a jinxy oficiálních postav, anglicky i
        česky, jsou z aplikace <Out href={BOARDGAMES}>BoardGames</Out> Štefana Bačkora (licence MIT). Český překlad je
        jeho a z jeho aplikace je i náš <Out href={scriptTool}>script tool</Out>.
      </P>

      <H2 id="homebrew">Homebrew postavy</H2>
      <P>
        Neoficiální postavy, které web zná, jsou z kolekcí na <Out href={HOMEBREW_WIKI}>BotC HomeBrew Wiki</Out>. Každá
        postava i její ikona patří autorovi své kolekce. Do češtiny je přeložila AI, takže se od originálu může místy
        lišit; originál je vždy na wiki.
      </P>
      <Collections by={(author) => `autor ${author}`} />
    </>
  );
}

function English({ scriptTool }: { scriptTool: string }) {
  return (
    <>
      <H2>Blood on the Clocktower</H2>
      <P>
        Blood on the Clocktower was designed by Steven Medway and is published by The Pandemonium Institute. The game,
        its official characters, their texts and icons are © The Pandemonium Institute. Doupě is a fan club&apos;s site,
        not affiliated with The Pandemonium Institute.
      </P>
      <Ul>
        <li>
          <Out href={BOTC}>bloodontheclocktower.com</Out> – the game&apos;s official site
        </li>
        <li>
          <Out href={WIKI}>wiki.bloodontheclocktower.com</Out> – the official wiki, where the character icons come from
        </li>
      </Ul>

      <H2>The official characters&apos; texts</H2>
      <P>
        The names, abilities, night order, Storyteller texts, reminder tokens and jinxes of the official characters, in
        English and Czech, come from Štefan Bačkor&apos;s <Out href={BOARDGAMES}>BoardGames</Out> (MIT licence). The Czech
        translation is his, and our <Out href={scriptTool}>script tool</Out> is his app too.
      </P>

      <H2 id="homebrew">Homebrew characters</H2>
      <P>
        The unofficial characters this site knows come from collections on the{" "}
        <Out href={HOMEBREW_WIKI}>BotC HomeBrew Wiki</Out>. Each character and its icon belong to the author of its
        collection. The Czech site has them translated by AI; the original is always on the wiki.
      </P>
      <Collections by={(author) => `by ${author}`} />
    </>
  );
}

export function SourcesContent({ locale, scriptTool }: { locale: Locale; scriptTool: string }) {
  return locale === "cs" ? <Czech scriptTool={scriptTool} /> : <English scriptTool={scriptTool} />;
}
