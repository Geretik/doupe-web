import type { Dict } from "@/i18n/dictionaries";
import type { PublicPlayer } from "@/modules/botc/lib/queries";

export function PlayerList({
  heading,
  players,
  t,
  muted = false,
}: {
  heading: string;
  players: PublicPlayer[];
  t: Dict;
  muted?: boolean;
}) {
  if (players.length === 0) return null;
  return (
    <div>
      <h2 className="text-sm font-medium text-muted">{heading}</h2>
      <ul className="mt-1 flex flex-wrap gap-2">
        {players.map((p, i) => (
          <li
            key={i}
            className={`rounded-full border border-border bg-card px-3 py-1 text-sm ${muted ? "text-muted" : ""}`}
          >
            {p.nickname}
            {p.canStorytell && (
              <span className="ml-1" title={t.session.storyteller} aria-label={t.session.storyteller}>
                🎩
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
