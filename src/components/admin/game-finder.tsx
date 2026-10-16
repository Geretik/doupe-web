"use client";

import { useMemo, useState, useTransition } from "react";
import { assignBarcodeAction, guessGameAction, type LoanActionResult } from "@/app/actions/loans";
import type { LoansAdminDict } from "@/i18n/loans";
import { normalizeBarcode } from "@/lib/barcode";
import { bundleOf, type PackedIn } from "@/lib/game-boxes";
import { matchesWords } from "@/lib/game-match";
import { Alert, Button, inputClass } from "../ui";

export type DeskGame = {
  id: number;
  name: string;
  year: number | null;
  url: string;
  expansion: boolean;
  note: string | null;
  /** Its other names on Zatrolené hry ("Ark Nova" of "Archa Nova"), found by the search too */
  aka: string[];
};

export type Desk = LoansAdminDict["desk"];

export const SHOWN_GAMES = 8;

/** How `g` matches the words typed: by its name (""), by another name (that name), or not at all (null) */
export function matchOf(g: DeskGame, query: string) {
  return matchesWords(g.name, query) ? "" : (g.aka.find((n) => matchesWords(n, query)) ?? null);
}

type Notice = { kind: "success" | "error" | "info"; text: string };
/** What GameUPC says an unknown code is: the games of the collection of that name */
type Guess = { code: string; done: boolean; name: string | null; gameIds: number[] };

/**
 * Finding a game of the collection, shared by Půjčovna and its library: by the bar code on its box (read by the
 * camera, or the digits typed – a USB reader types them too) or by its name. An unknown code goes to the game picked
 * next, GameUPC suggesting which. `onGame` gets the game found or picked, `onUnknown` hears of a code nobody knows.
 * Holds the notice under the search, which the actions run through `run` show too.
 */
export function useGameFinder({
  games,
  codes,
  t,
  onGame,
  onUnknown,
}: {
  games: DeskGame[];
  codes: { code: string; gameId: number }[];
  t: Desk;
  onGame: (id: number) => void;
  onUnknown: () => void;
}) {
  const [query, setQuery] = useState("");
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [guess, setGuess] = useState<Guess | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, startTransition] = useTransition();

  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const gameByCode = useMemo(() => new Map(codes.map((c) => [c.code, c.gameId])), [codes]);

  // digits only, as many as on a box: a name like "1775: Rebellion" is still searched by its first digits
  const looksLikeCode = /^\d{8,}$/.test(query.replace(/[\s-]/g, ""));
  // games by their name first, then by another name ("ark nova" finds "Archa Nova")
  const found: { game: DeskGame; aka?: string }[] =
    query.trim() && !looksLikeCode
      ? [
          ...games.filter((g) => matchesWords(g.name, query)).map((g) => ({ game: g })),
          ...games.flatMap((g) => {
            const aka = matchesWords(g.name, query) ? undefined : g.aka.find((n) => matchesWords(n, query));
            return aka ? [{ game: g, aka }] : [];
          }),
        ].slice(0, SHOWN_GAMES)
      : [];

  const run = (action: () => Promise<LoanActionResult>, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      setNotice(result.ok ? { kind: "success", text: result.message } : { kind: "error", text: result.error });
      if (result.ok) after?.();
    });

  const dropCode = () => {
    setPendingCode(null);
    setGuess(null);
  };

  /** Asks GameUPC which game an unknown code is; an answer to a code no longer waiting is dropped. */
  const lookUp = (code: string) => {
    setGuess({ code, done: false, name: null, gameIds: [] });
    guessGameAction({ code }).then(
      (r) => setGuess((g) => (g?.code === code ? { code, done: true, ...r } : g)),
      () => setGuess((g) => (g?.code === code ? null : g)),
    );
  };

  /** A game picked from the search or the guesses; the code read just before belongs to it. */
  const pick = (id: number) => {
    setNotice(null);
    setQuery("");
    onGame(id);
    if (pendingCode) {
      const code = pendingCode;
      dropCode();
      run(() => assignBarcodeAction({ code, gameId: id }));
    }
  };

  /** A code read or typed: its game, or the question which game it is. */
  const onCode = (raw: string) => {
    setQuery("");
    const code = normalizeBarcode(raw);
    if (!code) return setNotice({ kind: "error", text: t.badCode });
    const id = gameByCode.get(code);
    if (id !== undefined && gameById.has(id)) {
      dropCode();
      setNotice(null);
      return onGame(id);
    }
    onUnknown();
    setPendingCode(code);
    setNotice({ kind: "info", text: t.unknownCode.replace("{code}", code) });
    lookUp(code);
  };

  return { query, setQuery, pendingCode, guess, notice, setNotice, pending, run, dropCode, pick, onCode, looksLikeCode, found, gameById, gameByCode };
}

export type GameFinder = ReturnType<typeof useGameFinder>;

/**
 * The search box, the notice, GameUPC's guesses and the games found. `chosen` games (lending several) are ticked,
 * `lent` ones marked as out.
 */
export function FinderFields({
  finder,
  packedIn,
  chosen,
  lent,
  t,
}: {
  finder: GameFinder;
  packedIn: PackedIn;
  chosen?: Set<number>;
  lent?: Set<number>;
  t: Desk;
}) {
  const { query, setQuery, pendingCode, guess, notice, setNotice, dropCode, pick, onCode, looksLikeCode, found, gameById } = finder;
  const guessed = guess && guess.code === pendingCode ? guess : null;
  const isChosen = (id: number) => chosen?.has(id) ?? false;
  return (
    <>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t.search}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (looksLikeCode) onCode(query);
            else if (found[0]) pick(found[0].game.id);
          }}
          placeholder={t.searchPlaceholder}
          enterKeyHint="search"
          autoComplete="off"
          className={inputClass}
          data-testid="loan-search"
        />
      </label>

      {notice && (
        <div className="flex flex-wrap items-center gap-3" data-testid="loan-notice">
          <div className="min-w-0 flex-1">
            <Alert kind={notice.kind}>{notice.text}</Alert>
          </div>
          {pendingCode && notice.kind === "info" && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                dropCode();
                setNotice(null);
              }}
            >
              {t.dropCode}
            </Button>
          )}
        </div>
      )}

      {guessed && (!guessed.done || guessed.name) && (
        <div className="flex flex-col gap-2 text-sm" data-testid="loan-guess">
          {!guessed.done ? (
            <p className="text-muted">{t.guessing}</p>
          ) : guessed.gameIds.length === 0 ? (
            <p className="text-muted">{t.guessElsewhere.replace("{name}", guessed.name ?? "")}</p>
          ) : (
            <>
              <p>{t.guessFound.replace("{name}", guessed.name ?? "")}</p>
              <ul className="flex flex-wrap gap-2">
                {guessed.gameIds.flatMap((id) => {
                  const g = gameById.get(id);
                  return g ? (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => pick(id)}
                        className={`rounded-full border border-accent px-3 py-1 ${isChosen(id) ? "bg-accent text-accent-foreground" : "hover:bg-accent/10"}`}
                      >
                        {isChosen(id) && "✓ "}
                        {g.name}
                        {g.year && <span className={isChosen(id) ? "" : "text-muted"}> ({g.year})</span>}
                      </button>
                    </li>
                  ) : [];
                })}
              </ul>
            </>
          )}
        </div>
      )}

      {query.trim() && !looksLikeCode && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border" data-testid="loan-found">
          {found.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t.noMatch}</li>}
          {found.map(({ game: g, aka }) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => pick(g.id)}
                className={`flex w-full flex-wrap items-baseline gap-x-2 px-3 py-2 text-left ${isChosen(g.id) ? "bg-accent/10" : "hover:bg-border/40"}`}
              >
                <span className="font-medium">{g.name}</span>
                {g.year && <span className="text-sm text-muted">({g.year})</span>}
                {g.expansion && <span className="text-xs text-muted">{t.expansion}</span>}
                {aka && (
                  <span className="text-xs text-muted">
                    {t.aka} {aka}
                  </span>
                )}
                {packedIn[g.id] !== undefined && (
                  <span className="text-xs text-muted">
                    📦 {t.inBoxOf} {gameById.get(packedIn[g.id])?.name ?? "?"}
                  </span>
                )}
                {isChosen(g.id) && (
                  <span className="ml-auto self-center rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">✓ {t.chosen}</span>
                )}
                {lent?.has(g.id) && !isChosen(g.id) && <span className="ml-auto text-xs font-medium text-accent">{t.lent}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** The games of `id`'s bundle in the collection: the box's own game first, then the others by name; just `id` when alone */
export function bundleIn(id: number, packedIn: PackedIn, gameById: Map<number, DeskGame>) {
  const [box, ...rest] = bundleOf(id, packedIn).filter((g) => gameById.has(g));
  return box === undefined ? [] : [box, ...rest.sort((a, b) => gameById.get(a)!.name.localeCompare(gameById.get(b)!.name, "cs"))];
}
