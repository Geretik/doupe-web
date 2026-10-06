"use client";

import Link from "next/link";
import { useState } from "react";
import type { Dict } from "@/i18n/dictionaries";
import { BOTC_ZATROLENE_ID, isPrivateGame, type CollectionGame } from "@/lib/zatrolene";
import { inputClass } from "./ui";

const PLAYER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Lower case without diacritics, so "divu" finds "Divů". */
function fold(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** A game with its player count already worded ("2–4 hráči"), or null when not known. */
export type ListedGame = CollectionGame & { players: string | null };

/** The club's games with search and filters; without JavaScript the whole list is shown. */
export function GameList({ games, t }: { games: ListedGame[]; t: Dict["games"]["list"] }) {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState(0);
  const [clubOnly, setClubOnly] = useState(false);
  const [noExpansions, setNoExpansions] = useState(false);

  const q = fold(query.trim());
  const shown = games.filter(
    (g) =>
      (!q || fold(`${g.name} ${g.note ?? ""}`).includes(q)) &&
      (!players || (g.minPlayers <= players && players <= g.maxPlayers)) &&
      (!clubOnly || !isPrivateGame(g)) &&
      (!noExpansions || !g.expansion),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
          {t.search}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t.players}
          <select value={players} onChange={(e) => setPlayers(Number(e.target.value))} className={inputClass}>
            <option value={0}>{t.anyPlayers}</option>
            {PLAYER_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm sm:basis-full">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={clubOnly} onChange={(e) => setClubOnly(e.target.checked)} className="h-4 w-4 accent-accent" />
            {t.clubOnly}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={noExpansions} onChange={(e) => setNoExpansions(e.target.checked)} className="h-4 w-4 accent-accent" />
            {t.noExpansions}
          </label>
        </div>
      </div>

      <p className="text-sm text-muted" aria-live="polite">{t.shown.replace("{n}", String(shown.length)).replace("{total}", String(games.length))}</p>

      {shown.length === 0 ? (
        <p className="text-muted">{t.none}</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {shown.map((g, i) => (
            <li key={`${g.id}-${i}`} className="flex flex-col gap-0.5 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <a href={g.url} target="_blank" rel="noreferrer" className="font-medium hover:text-accent hover:underline">
                  {g.name}
                </a>
                {g.year && <span className="text-sm text-muted">({g.year})</span>}
                {g.expansion && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">{t.expansion}</span>
                )}
                {g.players && <span className="ml-auto whitespace-nowrap text-sm text-muted">{g.players}</span>}
              </div>
              {g.note && <p className="text-sm text-muted">{g.note}</p>}
              {g.id === BOTC_ZATROLENE_ID && (
                <Link href="/botc" className="text-sm text-accent hover:underline">{t.botc} →</Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
