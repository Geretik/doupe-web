"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { assignBarcodeAction, guessGameAction, lendGamesAction, removeBarcodeAction, returnLoanAction, type LoanActionResult } from "@/app/actions/loans";
import type { LoansAdminDict } from "@/i18n/loans";
import { normalizeBarcode } from "@/lib/barcode";
import { matchesWords } from "@/lib/game-match";
import { Alert, Button, inputClass } from "../ui";
import { BarcodeScanner } from "./barcode-scanner";

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
/** An open loan, its dates already worded by the page */
export type DeskLoan = {
  id: number;
  gameId: number;
  gameName: string;
  borrower: string | null;
  note: string | null;
  /** "3. 10." */
  since: string;
  /** "7 dní", "dnes" */
  age: string;
  /** "půjčil/a Kuba" */
  lentBy: string | null;
};

type Desk = LoansAdminDict["desk"];

const SHOWN_GAMES = 8;
const SHOWN_PEOPLE = 6;

/** The word for `n` things: [1, 2–4, 5+] */
function plural(n: number, [one, few, many]: string[]) {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}

type Notice = { kind: "success" | "error" | "info"; text: string };
/** What GameUPC says an unknown code is: the games of the collection of that name */
type Guess = { code: string; done: boolean; name: string | null; gameIds: number[] };
/** The camera on: finding one game, reading the code of the game shown, or reading box after box to lend */
type Scan = "find" | "code" | "batch" | null;

/** Who borrows (suggested from the attendance sheet and earlier loans) and a note. */
function BorrowerFields({
  borrower,
  setBorrower,
  note,
  setNote,
  people,
  t,
}: {
  borrower: string;
  setBorrower: (name: string) => void;
  note: string;
  setNote: (note: string) => void;
  people: string[];
  t: Desk;
}) {
  const suggested =
    borrower.trim() && !people.some((p) => p === borrower.trim()) ? people.filter((p) => matchesWords(p, borrower)).slice(0, SHOWN_PEOPLE) : [];
  return (
    <>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t.borrower}
        <input
          value={borrower}
          onChange={(e) => setBorrower(e.target.value)}
          placeholder={t.borrowerPlaceholder}
          required
          maxLength={200}
          autoComplete="off"
          className={inputClass}
          data-testid="loan-borrower"
        />
      </label>
      {suggested.length > 0 && (
        <ul className="-mt-2 flex flex-wrap gap-2" data-testid="loan-people">
          {suggested.map((p) => (
            <li key={p}>
              <button type="button" onClick={() => setBorrower(p)} className="rounded-full border border-border px-3 py-1 text-sm hover:border-accent">
                {p}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t.note}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.notePlaceholder} maxLength={500} autoComplete="off" className={inputClass} />
      </label>
    </>
  );
}

/**
 * Admin → Půjčovna: find a game by the bar code on its box (the phone's camera, or the digits typed – a USB reader
 * types them too) or by its name, then lend it or take it back; or lend several games to one person, box after box.
 * An unknown code goes to the game picked next, GameUPC suggesting which; the games whose code we don't know are
 * listed at the bottom.
 */
export function LoanDesk({
  games,
  codes,
  loans,
  last,
  people,
  initialGameId,
  t,
}: {
  games: DeskGame[];
  codes: { code: string; gameId: number }[];
  loans: DeskLoan[];
  /** Who had the game last, by game: "Petr Svoboda, 1. 10. – 5. 10." */
  last: Record<number, string>;
  /** Names to suggest, the latest seen first */
  people: string[];
  initialGameId: number | null;
  t: Desk;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(initialGameId);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [guess, setGuess] = useState<Guess | null>(null);
  const [scan, setScan] = useState<Scan>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [borrower, setBorrower] = useState("");
  const [note, setNote] = useState("");
  /** The games to lend to one person at once; null when lending one */
  const [batch, setBatch] = useState<number[] | null>(null);
  const [pending, startTransition] = useTransition();
  const gameSection = useRef<HTMLElement>(null);

  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const gameByCode = useMemo(() => new Map(codes.map((c) => [c.code, c.gameId])), [codes]);
  const loanByGame = useMemo(() => new Map(loans.map((l) => [l.gameId, l])), [loans]);
  const missing = useMemo(() => {
    const coded = new Set(codes.map((c) => c.gameId));
    return games.filter((g) => !coded.has(g.id));
  }, [games, codes]);

  const game = selectedId !== null && !batch ? gameById.get(selectedId) : undefined;
  const loan = game ? loanByGame.get(game.id) : undefined;
  const gameCodes = game ? codes.filter((c) => c.gameId === game.id).map((c) => c.code) : [];

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

  /** Shows a game, with an empty lending form. */
  const select = (id: number | null) => {
    setSelectedId(id);
    setQuery("");
    setBorrower("");
    setNote("");
    // the camera reading a code for the game shown was for that game
    setScan((s) => (s === "code" ? null : s));
  };

  /** A game from a list further down: shown, and scrolled to. */
  const show = (id: number) => {
    select(id);
    setNotice(null);
    requestAnimationFrame(() => gameSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

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

  /** A game to lend with the others; one already out is not added. */
  const addToBatch = (id: number) => {
    const g = gameById.get(id);
    if (!g) return;
    const out = loanByGame.get(id);
    if (out) return setNotice({ kind: "error", text: t.batchOut.replace("{game}", g.name).replace("{who}", out.borrower ?? "?") });
    if (batch?.includes(id)) return setNotice({ kind: "info", text: t.batchAlready.replace("{game}", g.name) });
    setBatch((b) => [...(b ?? []), id]);
    setNotice({ kind: "success", text: t.batchAdded.replace("{game}", g.name) });
  };

  /** A game picked from the search or the guesses; the code read just before belongs to it. */
  const pick = (id: number) => {
    setNotice(null);
    setQuery("");
    if (batch) addToBatch(id);
    else select(id);
    if (pendingCode) {
      const code = pendingCode;
      dropCode();
      run(() => assignBarcodeAction({ code, gameId: id }));
    }
  };

  /** A code read or typed: its game, or the question which game it is. */
  const onCode = (raw: string) => {
    if (scan === "find") setScan(null);
    setQuery("");
    const code = normalizeBarcode(raw);
    if (!code) return setNotice({ kind: "error", text: t.badCode });
    const id = gameByCode.get(code);
    if (id !== undefined && gameById.has(id)) {
      dropCode();
      if (batch) return addToBatch(id);
      setNotice(null);
      return select(id);
    }
    if (!batch) select(null);
    setPendingCode(code);
    setNotice({ kind: "info", text: t.unknownCode.replace("{code}", code) });
    lookUp(code);
  };

  /** The code on the box of the game shown. */
  const onBoxCode = (raw: string) => {
    setScan(null);
    if (!game) return;
    const code = normalizeBarcode(raw);
    if (!code) return setNotice({ kind: "error", text: t.badCode });
    const owner = gameByCode.get(code);
    if (owner === game.id) return setNotice({ kind: "info", text: t.codeHere.replace("{code}", code) });
    const other = owner !== undefined ? gameById.get(owner) : undefined;
    if (other && !confirm(t.codeMove.replace("{code}", code).replace("{game}", other.name))) return;
    const id = game.id;
    run(() => assignBarcodeAction({ code, gameId: id }));
  };

  const lend = () => {
    if (!game) return;
    const id = game.id;
    run(() => lendGamesAction({ gameIds: [id], borrower, note }), () => select(null));
  };

  /** Lending several: the game shown (when it is available) is the first, the name typed stays. */
  const startBatch = () => {
    setBatch(game && !loan ? [game.id] : []);
    setSelectedId(null);
    setNotice(null);
    setScan((s) => (s === "code" ? null : s));
  };

  const endBatch = () => {
    setBatch(null);
    setScan((s) => (s === "batch" ? null : s));
    setBorrower("");
    setNote("");
  };

  const lendBatch = () => {
    if (!batch?.length) return;
    const ids = batch;
    run(() => lendGamesAction({ gameIds: ids, borrower, note }), endBatch);
  };

  const giveBack = (l: DeskLoan, ask: boolean) => {
    if (ask && !confirm(t.returnConfirm.replace("{game}", l.gameName))) return;
    run(() => returnLoanAction(l.id), () => {
      if (selectedId === l.gameId) select(null);
    });
  };

  const guessed = guess && guess.code === pendingCode ? guess : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        {scan === "find" || scan === "batch" ? (
          <BarcodeScanner key={scan} onCode={onCode} onClose={() => setScan(null)} continuous={scan === "batch"} t={t} />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setScan(batch ? "batch" : "find")} data-testid="loan-scan">
              {batch ? t.batchScan : t.scan}
            </Button>
            {!batch && (
              <Button type="button" variant="secondary" onClick={startBatch} data-testid="loan-batch-start">
                {t.batchStart}
              </Button>
            )}
          </div>
        )}

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
                        <button type="button" onClick={() => pick(id)} className="rounded-full border border-accent px-3 py-1 hover:bg-accent/10">
                          {g.name}
                          {g.year && <span className="text-muted"> ({g.year})</span>}
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
                <button type="button" onClick={() => pick(g.id)} className="flex w-full flex-wrap items-baseline gap-x-2 px-3 py-2 text-left hover:bg-border/40">
                  <span className="font-medium">{g.name}</span>
                  {g.year && <span className="text-sm text-muted">({g.year})</span>}
                  {g.expansion && <span className="text-xs text-muted">{t.expansion}</span>}
                  {aka && (
                    <span className="text-xs text-muted">
                      {t.aka} {aka}
                    </span>
                  )}
                  {loanByGame.has(g.id) && <span className="ml-auto text-xs font-medium text-accent">{t.lent}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {batch && (
        <section className="flex flex-col gap-3 rounded-lg border border-border p-4" data-testid="loan-batch">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">{t.batchTitle}</h3>
            <button type="button" onClick={endBatch} className="text-sm text-accent hover:underline">
              {t.batchCancel}
            </button>
          </div>
          <p className="text-sm text-muted">{t.batchHint}</p>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              lendBatch();
            }}
          >
            <BorrowerFields borrower={borrower} setBorrower={setBorrower} note={note} setNote={setNote} people={people} t={t} />
            {batch.length === 0 ? (
              <p className="text-sm text-muted">{t.batchEmpty}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border border-y border-border" data-testid="loan-batch-games">
                {batch.flatMap((id) => {
                  const g = gameById.get(id);
                  return g ? (
                    <li key={id} className="flex flex-wrap items-baseline gap-x-2 py-2">
                      <span className="font-medium">{g.name}</span>
                      {g.year && <span className="text-sm text-muted">({g.year})</span>}
                      {g.expansion && <span className="text-xs text-muted">{t.expansion}</span>}
                      <button
                        type="button"
                        onClick={() => setBatch((b) => b && b.filter((x) => x !== id))}
                        aria-label={`${t.batchRemove} ${g.name}`}
                        title={t.batchRemove}
                        className="ml-auto rounded px-1 text-accent hover:bg-accent/10"
                      >
                        ✕
                      </button>
                    </li>
                  ) : [];
                })}
              </ul>
            )}
            <div>
              <Button type="submit" disabled={pending || batch.length === 0} data-testid="loan-batch-lend">
                {pending ? t.working : t.batchLend.replace("{n}", `${batch.length} ${plural(batch.length, t.games)}`)}
              </Button>
            </div>
          </form>
        </section>
      )}

      {game && (
        <section ref={gameSection} className="flex scroll-mt-4 flex-col gap-3 rounded-lg border border-border p-4" data-testid="loan-game">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">
              {game.name}
              {game.year && <span className="ml-2 font-normal text-muted">({game.year})</span>}
              {game.expansion && <span className="ml-2 text-xs font-normal text-muted">{t.expansion}</span>}
            </h3>
            <button type="button" onClick={() => select(null)} className="text-sm text-accent hover:underline">
              {t.other}
            </button>
          </div>
          {game.note && <p className="text-sm text-muted">{game.note}</p>}

          {loan ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent/50 bg-accent/10 px-3 py-2" data-testid="loan-status">
              <span>
                <span className="font-medium">{t.lentTo}</span> {loan.borrower ?? "?"}
                <span className="text-sm text-muted">
                  {" "}
                  · {loan.since} ({loan.age})
                </span>
                {loan.note && <span className="block text-sm text-muted">{loan.note}</span>}
              </span>
              <Button type="button" disabled={pending} onClick={() => giveBack(loan, false)}>
                {pending ? t.working : t.markReturned}
              </Button>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                lend();
              }}
              data-testid="loan-form"
            >
              <p className="text-sm text-green-800 dark:text-green-300">{t.available}</p>
              <BorrowerFields borrower={borrower} setBorrower={setBorrower} note={note} setNote={setNote} people={people} t={t} />
              <div>
                <Button type="submit" disabled={pending}>
                  {pending ? t.working : t.lend}
                </Button>
              </div>
            </form>
          )}

          {last[game.id] && (
            <p className="text-sm text-muted">
              {t.last} {last[game.id]}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-sm">
            <span className="text-muted">{t.codes}:</span>
            {gameCodes.length === 0 && <span className="text-muted">{t.noCodes}</span>}
            {gameCodes.map((code) => (
              <span key={code} className="inline-flex items-center gap-1 font-mono" data-testid="loan-code">
                {code}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(t.removeCodeConfirm.replace("{code}", code))) run(() => removeBarcodeAction({ code }));
                  }}
                  aria-label={`${t.removeCode} ${code}`}
                  title={t.removeCode}
                  className="rounded px-1 text-accent hover:bg-accent/10"
                >
                  ✕
                </button>
              </span>
            ))}
            {scan !== "code" && (
              <button type="button" disabled={pending} onClick={() => setScan("code")} className="text-accent hover:underline" data-testid="loan-add-code">
                {t.addCode}
              </button>
            )}
            <a href={game.url} target="_blank" rel="noreferrer" className="ml-auto text-accent hover:underline">
              {t.zatrolene}
            </a>
          </div>
          {scan === "code" && <BarcodeScanner onCode={onBoxCode} onClose={() => setScan(null)} t={t} />}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">
          {t.openLoans} <span className="font-normal text-muted">({loans.length})</span>
        </h3>
        {loans.length === 0 ? (
          <p className="text-sm text-muted">{t.noOpenLoans}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border" data-testid="loan-open">
            {loans.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                {batch ? (
                  <span className="font-medium">{l.gameName}</span>
                ) : (
                  <button type="button" onClick={() => show(l.gameId)} className="font-medium hover:text-accent hover:underline">
                    {l.gameName}
                  </button>
                )}
                <span>{l.borrower ?? "?"}</span>
                <span className="text-sm text-muted">
                  {l.since} ({l.age}){l.lentBy && ` · ${l.lentBy}`}
                </span>
                {l.note && <span className="basis-full text-sm text-muted">{l.note}</span>}
                <span className="ml-auto">
                  <Button type="button" variant="secondary" disabled={pending} onClick={() => giveBack(l, true)}>
                    {t.markReturned}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!batch && (
        <details data-testid="loan-missing">
          <summary className="cursor-pointer font-semibold">
            {t.missing} <span className="font-normal text-muted">({missing.length})</span>
          </summary>
          {missing.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t.missingNone}</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted">{t.missingHint}</p>
              <ul className="mt-2 columns-1 gap-6 text-sm sm:columns-2 lg:columns-3">
                {missing.map((g) => (
                  <li key={g.id} className="break-inside-avoid">
                    <button type="button" onClick={() => show(g.id)} className="py-0.5 text-left hover:text-accent hover:underline">
                      {g.name}
                      {g.expansion && <span className="ml-1 text-xs text-muted">{t.expansion}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
    </div>
  );
}
