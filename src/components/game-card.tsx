import { GameRoster } from "@/components/game-roster";
import type { Dict, Locale } from "@/i18n/dictionaries";
import type { GameWithPlayers } from "@/lib/queries";

/** One played game as the archive shows it: number, script, player count, winner, and who played what. */
export function GameCard({
  game: g,
  number,
  locale,
  t,
  me,
}: {
  game: GameWithPlayers;
  number: number;
  locale: Locale;
  t: Pick<Dict, "archive" | "session">;
  /** the viewing player's registrations, highlighted in the roster */
  me?: ReadonlySet<number>;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          <span aria-hidden className="mr-1.5">🎲</span>
          <span className="font-semibold">{t.archive.gameNumber(number)}</span>
          <span className="text-muted"> · </span>
          {g.scriptUrl ? <a href={g.scriptUrl} className="hover:underline" target="_blank" rel="noreferrer">{g.scriptName}</a> : g.scriptName}
          {g.players && <span className="text-muted"> · {t.archive.gamePlayers(g.players)}</span>}
        </span>
        {g.winner && (
          <span
            className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${g.winner === "good" ? "bg-good/10 text-good" : "bg-accent/10 text-accent"}`}
          >
            {g.winner === "good" ? "😇" : "😈"} {t.archive.winner[g.winner]}
          </span>
        )}
      </div>
      <GameRoster
        players={g.roster}
        bluffs={g.demonBluffs}
        locale={locale}
        t={{ storyteller: t.session.storytellerLabel, sides: t.archive.sides, linked: t.archive.linked }}
        me={me}
      />
    </li>
  );
}
