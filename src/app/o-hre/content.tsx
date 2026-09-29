import type { Locale } from "@/i18n/dictionaries";
import { H2, H3, P, Ul } from "@/components/prose";
import { Card } from "@/components/ui";

function Czech() {
  return (
    <>
      <H2>Co je Krvavá hodina odbila</H2>
      <P>
        <strong>Krvavá hodina odbila</strong> je velká blafovací a sociálně dedukční hra pro
        zhruba <strong>5–20 hráčů</strong> a jednoho <strong>Vypravěče</strong>. Prakticky
        ale nejlépe funguje, když se sejde <strong>aspoň 8 lidí</strong>.
      </P>
      <P>
        Každý hráč dostane <strong>unikátní roli</strong>. Některé role patří na stranu{" "}
        <strong>dobra</strong>, jiné na stranu <strong>zla</strong>. Dobří se snaží přijít na
        to, kdo je Démon, zatímco zlí se snaží město zmást, rozhádat a dovést k chybným
        popravám.
      </P>
      <P>
        Hra se odehrává v ponurém městečku <strong>Ravenswood Bluff</strong>, kde se přes
        den vyšetřuje, vyjednává, lže, blafuje a hlasuje o popravě podezřelých. V noci pak{" "}
        <strong>Démon a jeho přisluhovači</strong> tajně útočí a další role získávají
        informace nebo používají své schopnosti.
      </P>
      <P>
        Největší rozdíl oproti klasickým dedukčním hrám je ten, že{" "}
        <strong>smrt tě nevyřadí ze hry</strong>. I mrtví hráči dál mluví, dál se snaží
        pomoct svému týmu a stále mají omezený vliv na hru. Díky tomu se nikdo nenudí a
        partie drží napětí až do konce.
      </P>
      <Card className="mt-5 space-y-1">
        <p><strong>Dobro vyhraje</strong>, když se mu podaří odhalit a popravit Démona.</p>
        <p>
          <strong>Zlo vyhraje</strong>, když Démon přežije tak dlouho, až ve hře zůstanou jen{" "}
          <strong>dva živí hráči</strong>.
        </p>
      </Card>

      <H2>Jak probíhá hra</H2>
      <H3>1. Noc</H3>
      <Ul>
        <li>Vypravěč postupně probouzí příslušné role a vyhodnocuje jejich schopnosti.</li>
        <li>Některé postavy získávají informace, jiné někoho chrání, matou nebo zabíjejí.</li>
        <li><strong>První noc</strong> bývá speciální a často rozdává důležité startovní informace.</li>
      </Ul>
      <H3>2. Den</H3>
      <Ul>
        <li>Hráči se dozví, co se během noci stalo, typicky kdo zemřel.</li>
        <li>Následují <strong>soukromé debaty</strong> v menších skupinkách i <strong>veřejná diskuze</strong>.</li>
        <li>Pak přijde na řadu <strong>nominace a hlasování</strong> o tom, kdo bude popraven.</li>
        <li>Pokud poprava projde, hráč zemře a hra pokračuje dál – nebo končí, pokud padl Démon.</li>
      </Ul>

      <H2>Proč je Krvavka tak dobrá</H2>
      <Ul>
        <li>každý hráč má <strong>vlastní schopnost</strong>, takže každý je důležitý</li>
        <li>i po smrti jsi <strong>pořád ve hře</strong></li>
        <li>je tam hodně prostoru pro <strong>logiku, blafování i sociální hru</strong></li>
        <li>partie bývají napínavé až do úplného konce</li>
        <li>funguje dobře jak pro lidi, co chtějí dedukovat, tak pro ty, co si chtějí hlavně povídat, kecat a motat ostatní</li>
      </Ul>

      <H2>Krvavka v rámci Doupěte</H2>
      <P>
        Není problém vypsat Krvavku v rámci Doupěte jako klasické klubové hraní. Když o to
        bude zájem, můžeme se domluvit a něco zorganizovat – jen je potřeba počítat s tím,
        že tahle hra chce <strong>víc lidí</strong> než běžné deskovky.
      </P>
      <P>
        Domluvu můžeme klidně řešit v rámci <strong>#chat</strong> nebo v běžném kanálu ke
        konkrétnímu klubovému hraní.
      </P>
    </>
  );
}

function English() {
  return (
    <>
      <H2>What is Blood on the Clocktower</H2>
      <P>
        <strong>Blood on the Clocktower</strong> is a large bluffing and social deduction game
        for roughly <strong>5–20 players</strong> plus one <strong>Storyteller</strong>. In
        practice it works best with <strong>at least 8 people</strong>.
      </P>
      <P>
        Every player gets a <strong>unique role</strong>. Some roles belong to the side of{" "}
        <strong>good</strong>, others to <strong>evil</strong>. The good team tries to work
        out who the Demon is, while the evil team tries to confuse the town, sow discord and
        steer it towards executing the wrong people.
      </P>
      <P>
        The game takes place in the gloomy town of <strong>Ravenswood Bluff</strong>. During the
        day the town investigates, negotiates, lies, bluffs and votes on whom to execute. At
        night the <strong>Demon and its Minions</strong> strike in secret, while other roles
        gather information or use their abilities.
      </P>
      <P>
        The biggest difference from classic deduction games is that{" "}
        <strong>death doesn&apos;t knock you out of the game</strong>. Dead players keep
        talking, keep helping their team and still have a limited influence on the game.
        Nobody gets bored and the tension holds until the very end.
      </P>
      <Card className="mt-5 space-y-1">
        <p><strong>Good wins</strong> when it manages to identify and execute the Demon.</p>
        <p>
          <strong>Evil wins</strong> when the Demon survives until only{" "}
          <strong>two living players</strong> remain.
        </p>
      </Card>

      <H2>How a game plays out</H2>
      <H3>1. Night</H3>
      <Ul>
        <li>The Storyteller wakes the relevant roles one by one and resolves their abilities.</li>
        <li>Some characters gain information, others protect, mislead or kill someone.</li>
        <li>The <strong>first night</strong> is special and often hands out important starting information.</li>
      </Ul>
      <H3>2. Day</H3>
      <Ul>
        <li>Players learn what happened during the night, typically who died.</li>
        <li>Then come <strong>private conversations</strong> in small groups and a <strong>public discussion</strong>.</li>
        <li>Next are <strong>nominations and voting</strong> on who will be executed.</li>
        <li>If the execution passes, the player dies and the game continues – or ends, if the Demon has fallen.</li>
      </Ul>

      <H2>Why the game is so good</H2>
      <Ul>
        <li>every player has <strong>their own ability</strong>, so everyone matters</li>
        <li>even after death you are <strong>still in the game</strong></li>
        <li>there is plenty of room for <strong>logic, bluffing and social play</strong></li>
        <li>games tend to stay tense until the very end</li>
        <li>it works both for people who love deducing and for those who mainly want to chat, scheme and mess with the others</li>
      </Ul>

      <H2>Playing with the Doupě club</H2>
      <P>
        We can happily schedule Blood on the Clocktower as a regular club game night with
        Doupě. If there is interest, we&apos;ll arrange something – just keep in mind that
        this game needs <strong>more people</strong> than the usual board games.
      </P>
      <P>
        We can arrange it in <strong>#chat</strong> or in the usual channel for a specific club
        game night.
      </P>
    </>
  );
}

export function AboutContent({ locale }: { locale: Locale }) {
  return locale === "en" ? <English /> : <Czech />;
}
