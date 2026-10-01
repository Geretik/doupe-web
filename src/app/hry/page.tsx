import type { Metadata } from "next";
import { refreshGameCollectionAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/admin/action-button";
import { GameList } from "@/components/game-list";
import { Alert } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { isAdmin } from "@/lib/admin-auth";
import { FRESH_MINUTES, getGameCollection } from "@/lib/game-collection";
import { formatShortDate, formatTime } from "@/lib/time";
import { clubCollectionUrl } from "@/lib/zatrolene";

export const dynamic = "force-dynamic";

const linkClass = "underline hover:text-accent";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: `${t.games.title} – ${t.meta.title}`, description: t.games.subtitle };
}

/** The club's game collection, kept on Zatrolené hry and copied here (lib/game-collection). */
export default async function GamesPage() {
  const [{ locale, t }, collection, admin] = await Promise.all([getDict(), getGameCollection(), isAdmin()]);
  const g = t.games;
  const games = (collection?.games ?? []).map((game) => ({
    ...game,
    players: game.maxPlayers > 0 ? g.playerCount(game.minPlayers, game.maxPlayers) : null,
  }));
  const source = (
    <a href={clubCollectionUrl()} target="_blank" rel="noreferrer" className={linkClass}>{g.sourceLink}</a>
  );
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{g.title}</h1>
        <p className="mt-2 text-muted">{g.subtitle}</p>
        <p className="mt-3 leading-relaxed">{g.intro}</p>
      </div>

      {games.length > 0 ? (
        <GameList games={games} t={g.list} />
      ) : (
        <Alert kind="info">{g.unavailable}{source}.</Alert>
      )}

      <div className="flex flex-col items-start gap-2 text-sm text-muted">
        <p>
          {g.source}{source}{g.sourceAfter(FRESH_MINUTES)}
          {collection?.loadedAt && (
            <> {g.loadedAt(`${formatShortDate(collection.loadedAt, locale)} ${formatTime(collection.loadedAt, locale)}`)}</>
          )}
        </p>
        {admin && <ActionButton action={refreshGameCollectionAction} label={g.refresh} pendingLabel={g.refreshing} />}
      </div>
    </div>
  );
}
