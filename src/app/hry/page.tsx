import type { Metadata } from "next";
import Link from "next/link";
import data from "@/data/game-collection.json";
import { GameList } from "@/components/game-list";
import { getDict } from "@/i18n/server";
import { formatDay } from "@/lib/time";
import { CLUB_COLLECTION_URL, type CollectionGame } from "@/lib/zatrolene";

export const dynamic = "force-dynamic";

const linkClass = "underline hover:text-accent";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: `${t.games.title} – ${t.meta.title}`, description: t.games.subtitle };
}

/** The club's game collection, a subpage of the club page; kept on Zatrolené hry and copied here by `npm run hry`. */
export default async function GamesPage() {
  const { locale, t } = await getDict();
  const g = t.games;
  const games = (data.games as CollectionGame[]).map((game) => ({
    ...game,
    players: game.maxPlayers > 0 ? g.playerCount(game.minPlayers, game.maxPlayers) : null,
  }));
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{g.title}</h1>
        <p className="mt-2 text-muted">{g.subtitle}</p>
        <p className="mt-3 leading-relaxed">{g.intro}</p>
      </div>

      <GameList games={games} t={g.list} />

      <p className="text-sm text-muted">
        {g.source}
        <a href={CLUB_COLLECTION_URL} target="_blank" rel="noreferrer" className={linkClass}>{g.sourceLink}</a>
        {g.updatedAt(formatDay(new Date(data.updatedAt), locale))}
      </p>
      <Link href="/" className="text-sm text-muted hover:underline">{g.back}</Link>
    </div>
  );
}
