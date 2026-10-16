"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  assignBarcodeAction,
  guessGameAction,
  lendGamesAction,
  packGameAction,
  removeBarcodeAction,
  returnLoansAction,
  setNoBarcodeAction,
  type LoanActionResult,
} from "@/app/actions/loans";
import type { LoansAdminDict } from "@/i18n/loans";
import { normalizeBarcode } from "@/lib/barcode";
import { boxesWithCode, boxOf, bundleOf, type PackedIn } from "@/lib/game-boxes";
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

/** How `g` matches the words typed: by its name (""), by another name (that name), or not at all (null) */
function matchOf(g: DeskGame, query: string) {
  return matchesWords(g.name, query) ? "" : (g.aka.find((n) => matchesWords(n, query)) ?? null);
}

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
 * listed at the bottom. A box without a code is marked so and found by its name only. Games in one box (an expansion
 * built into the base game) are a bundle: a code of any of them finds it, and it is lent and returned together.
 */
export function LoanDesk({
  games,
  codes,
  noBarcode,
  packedIn,
  loans,
  last,
  people,
  initialGameId,
  t,
}: {
  games: DeskGame[];
  codes: { code: string; gameId: number }[];
  /** The games whose box has no bar code (the box's game of a bundle) */
  noBarcode: number[];
  packedIn: PackedIn;
  loans: DeskLoan[];
  /** Who had the game last, by game: "Petr Svoboda, 1. 10. – 5. 10." */
  last: Record<number, string>;
  /** Names to suggest, the latest seen first */
  people: string[];
  initialGameId: number | null;
  t: Desk;
}) {
  const [query, setQuery] = useState("");
  /** The search in the list of games without a code */
  const [missingQuery, setMissingQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(initialGameId);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [guess, setGuess] = useState<Guess | null>(null);
  const [scan, setScan] = useState<Scan>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [borrower, setBorrower] = useState("");
  const [note, setNote] = useState("");
  /** The games to lend to one person at once; null when lending one */
  const [batch, setBatch] = useState<number[] | null>(null);
  /** The game of the list added or read again last, picked out on it */
  const [lastChosen, setLastChosen] = useState<number | null>(null);
  /** The games of the bundle shown not to lend this time (unticked) */
  const [skip, setSkip] = useState<number[]>([]);
  /** Choosing a game to put in the box of the game shown */
  const [packing, setPacking] = useState(false);
  const [packQuery, setPackQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const gameSection = useRef<HTMLElement>(null);

  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const gameByCode = useMemo(() => new Map(codes.map((c) => [c.code, c.gameId])), [codes]);
  const loanByGame = useMemo(() => new Map(loans.map((l) => [l.gameId, l])), [loans]);
  const chosen = useMemo(() => new Set(batch ?? []), [batch]);
  const marked = useMemo(() => new Set(noBarcode), [noBarcode]);
  const withCode = useMemo(() => boxesWithCode(codes, packedIn), [codes, packedIn]);

  /** The games of `id`'s bundle in the collection: the box's own game first, then the others by name; just `id` when alone */
  const bundle = (id: number) => {
    const [box, ...rest] = bundleOf(id, packedIn).filter((g) => gameById.has(g));
    return box === undefined ? [] : [box, ...rest.sort((a, b) => gameById.get(a)!.name.localeCompare(gameById.get(b)!.name, "cs"))];
  };
  const name = (id: number) => gameById.get(id)?.name ?? "?";

  // the boxes (games not packed in another): a code of any game of the box finds it, a box marked as having none is
  // found by its name
  const boxes = games.filter((g) => boxOf(g.id, packedIn) === g.id);
  const missing = boxes.filter((g) => !withCode.has(g.id) && !marked.has(g.id));
  const noCodeBoxes = boxes.filter((g) => !withCode.has(g.id) && marked.has(g.id));
  const bundles = boxes.filter((g) => bundle(g.id).length > 1);

  // the list without codes searched like the desk: by the name, then by another name, or a game packed in the box
  const missingShown: { game: DeskGame; aka?: string }[] = missingQuery.trim()
    ? missing.flatMap((g) => {
        const match = matchOf(g, missingQuery);
        if (match !== null) return [{ game: g, aka: match || undefined }];
        return bundle(g.id).some((id) => matchOf(gameById.get(id)!, missingQuery) !== null) ? [{ game: g }] : [];
      })
    : missing.map((g) => ({ game: g }));

  const game = selectedId !== null && !batch ? gameById.get(selectedId) : undefined;
  const loan = game ? loanByGame.get(game.id) : undefined;
  const gameCodes = game ? codes.filter((c) => c.gameId === game.id).map((c) => c.code) : [];
  // the bundle of the game shown: lent together (but the games unticked), back together from one who has them all
  const shownBundle = game ? bundle(game.id) : [];
  const host = game ? packedIn[game.id] : undefined;
  const boxCovered = game ? withCode.has(boxOf(game.id, packedIn)) : false;
  const boxMarked = game ? marked.has(boxOf(game.id, packedIn)) : false;
  const lendIds = shownBundle.filter((id) => !loanByGame.has(id) && !skip.includes(id));
  const together = loan ? loans.filter((l) => shownBundle.includes(l.gameId) && l.borrower === loan.borrower) : [];
  // games to put in its box: not itself, not in it already, not a box with games of its own (boxes don't nest)
  const packFound =
    game && packQuery.trim()
      ? games
          .filter((g) => g.id !== game.id && packedIn[g.id] !== game.id && !(bundle(g.id).length > 1 && boxOf(g.id, packedIn) === g.id) && matchOf(g, packQuery) !== null)
          .slice(0, SHOWN_GAMES)
      : [];

  // the open loans as rows: the games of a bundle out to one person are one row, the box's game first
  const loanRows: DeskLoan[][] = [];
  const rowOf = new Map<string, DeskLoan[]>();
  for (const l of loans) {
    const key = bundle(l.gameId).length > 1 ? `${boxOf(l.gameId, packedIn)} ${l.borrower}` : `#${l.id}`;
    const row = rowOf.get(key);
    if (row) row.push(l);
    else {
      rowOf.set(key, [l]);
      loanRows.push(rowOf.get(key)!);
    }
  }
  for (const row of loanRows) {
    const order = bundle(row[0].gameId);
    row.sort((a, b) => order.indexOf(a.gameId) - order.indexOf(b.gameId));
  }

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
    setSkip([]);
    setPacking(false);
    setPackQuery("");
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

  /** A game to lend with the others, with the games of its box; one already out is not added. */
  const addToBatch = (id: number) => {
    const g = gameById.get(id);
    if (!g) return;
    const out = loanByGame.get(id);
    if (out) return setNotice({ kind: "error", text: t.batchOut.replace("{game}", g.name).replace("{who}", out.borrower ?? "?") });
    setLastChosen(id);
    if (chosen.has(id)) return setNotice({ kind: "info", text: t.batchAlready.replace("{game}", g.name) });
    const more = bundle(id).filter((x) => x !== id && !loanByGame.has(x) && !chosen.has(x));
    setBatch((b) => [...(b ?? []), id, ...more]);
    setNotice({ kind: "success", text: t.batchAdded.replace("{game}", [id, ...more].map(name).join(", ")) });
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
    if (!lendIds.length) return;
    const ids = lendIds;
    run(() => lendGamesAction({ gameIds: ids, borrower, note }), () => select(null));
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
    setLastChosen(null);
    setScan((s) => (s === "batch" ? null : s));
    setBorrower("");
    setNote("");
  };

  const lendBatch = () => {
    if (!batch?.length) return;
    const ids = batch;
    run(() => lendGamesAction({ gameIds: ids, borrower, note }), endBatch);
  };

  /** One loan, or the games of a bundle out to one person, came back. */
  const giveBack = (back: DeskLoan[], ask: boolean) => {
    const question =
      back.length === 1 ? t.returnConfirm.replace("{game}", back[0].gameName) : t.returnConfirmBundle.replace("{games}", back.map((l) => l.gameName).join(", "));
    if (ask && !confirm(question)) return;
    run(() => returnLoansAction(back.map((l) => l.id)), () => {
      if (back.some((l) => l.gameId === selectedId)) select(null);
    });
  };

  const pack = (id: number, box: number | null) =>
    run(() => packGameAction({ gameId: id, box }), () => {
      setPacking(false);
      setPackQuery("");
    });

  const guessed = guess && guess.code === pendingCode ? guess : null;

  /** A box in a list at the bottom: its game (shown on a tap), and the games packed in it */
  const boxButton = (g: DeskGame, aka?: string) => (
    <button type="button" onClick={() => show(g.id)} className="py-0.5 text-left hover:text-accent hover:underline">
      {g.name}
      {g.expansion && <span className="ml-1 text-xs text-muted">{t.expansion}</span>}
      {aka && (
        <span className="ml-1 text-xs text-muted">
          {t.aka} {aka}
        </span>
      )}
      {bundle(g.id).length > 1 && (
        <span className="ml-1 text-xs text-muted">
          + {bundle(g.id).slice(1).map(name).join(", ")}
        </span>
      )}
    </button>
  );

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
                        <button
                          type="button"
                          onClick={() => pick(id)}
                          className={`rounded-full border border-accent px-3 py-1 ${chosen.has(id) ? "bg-accent text-accent-foreground" : "hover:bg-accent/10"}`}
                        >
                          {chosen.has(id) && "✓ "}
                          {g.name}
                          {g.year && <span className={chosen.has(id) ? "" : "text-muted"}> ({g.year})</span>}
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
                  className={`flex w-full flex-wrap items-baseline gap-x-2 px-3 py-2 text-left ${chosen.has(g.id) ? "bg-accent/10" : "hover:bg-border/40"}`}
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
                      📦 {t.inBoxOf} {name(packedIn[g.id])}
                    </span>
                  )}
                  {chosen.has(g.id) && (
                    <span className="ml-auto self-center rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">✓ {t.chosen}</span>
                  )}
                  {loanByGame.has(g.id) && !chosen.has(g.id) && <span className="ml-auto text-xs font-medium text-accent">{t.lent}</span>}
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
            <h4 className="font-semibold">
              {t.batchChosen} <span className="font-normal text-muted">({batch.length})</span>
            </h4>
            {batch.length === 0 ? (
              <p className="-mt-2 text-sm text-muted">{t.batchEmpty}</p>
            ) : (
              <ul className="-mt-1 flex flex-col gap-2" data-testid="loan-batch-games">
                {batch.flatMap((id) => {
                  const g = gameById.get(id);
                  return g ? (
                    <li
                      key={id}
                      // the one added or read again last stands out
                      aria-current={id === lastChosen ? "true" : undefined}
                      className={`flex flex-wrap items-baseline gap-x-2 rounded-md border px-3 py-2 transition-colors ${
                        id === lastChosen ? "border-accent bg-accent/20 ring-1 ring-accent" : "border-accent/40 bg-accent/10"
                      }`}
                    >
                      <span className="font-bold text-accent" aria-hidden>
                        ✓
                      </span>
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
          {shownBundle.length > 1 && (
            <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm" data-testid="loan-bundle">
              <span className="font-medium">📦 {t.bundle}:</span>
              {shownBundle.map((id, i) => (
                <span key={id}>
                  {i > 0 && "+ "}
                  {id === game.id ? (
                    <span className="font-medium">{name(id)}</span>
                  ) : (
                    <button type="button" onClick={() => show(id)} className="text-accent hover:underline">
                      {name(id)}
                    </button>
                  )}
                </span>
              ))}
            </p>
          )}

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
              {together.length > 1 ? (
                <span className="flex flex-wrap gap-2">
                  <Button type="button" disabled={pending} onClick={() => giveBack(together, false)} data-testid="loan-return-bundle">
                    {pending ? t.working : t.returnBundle}
                  </Button>
                  <Button type="button" variant="secondary" disabled={pending} onClick={() => giveBack([loan], false)}>
                    {t.returnOnly}
                  </Button>
                </span>
              ) : (
                <Button type="button" disabled={pending} onClick={() => giveBack([loan], false)}>
                  {pending ? t.working : t.markReturned}
                </Button>
              )}
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
              {shownBundle.length > 1 && (
                <fieldset className="flex flex-col gap-1.5 text-sm" data-testid="loan-bundle-games">
                  <legend className="mb-1 font-medium">{t.bundleLend}</legend>
                  {shownBundle.map((id) => {
                    const out = loanByGame.get(id);
                    return (
                      <label key={id} className={`flex flex-wrap items-center gap-x-2 ${out ? "text-muted" : ""}`}>
                        <input
                          type="checkbox"
                          checked={!out && !skip.includes(id)}
                          disabled={!!out}
                          onChange={(e) => setSkip((s) => (e.target.checked ? s.filter((x) => x !== id) : [...s, id]))}
                          className="h-4 w-4 accent-accent"
                        />
                        {name(id)}
                        {gameById.get(id)?.expansion && <span className="text-xs text-muted">{t.expansion}</span>}
                        {out && (
                          <span className="text-xs font-medium text-accent">
                            {t.lentTo} {out.borrower ?? "?"}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </fieldset>
              )}
              <div>
                <Button type="submit" disabled={pending || lendIds.length === 0}>
                  {pending ? t.working : lendIds.length > 1 ? t.batchLend.replace("{n}", `${lendIds.length} ${plural(lendIds.length, t.games)}`) : t.lend}
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
            {gameCodes.length === 0 &&
              (boxCovered ? (
                <span className="text-muted">{t.codesInBundle}</span>
              ) : boxMarked ? (
                <span className="text-muted" data-testid="loan-no-barcode">
                  {t.noBarcode}
                </span>
              ) : (
                <span className="text-muted">{t.noCodes}</span>
              ))}
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
            {!boxCovered && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => setNoBarcodeAction({ gameId: game.id, value: !boxMarked }))}
                className="text-accent hover:underline"
                data-testid="loan-no-barcode-toggle"
              >
                {boxMarked ? t.noBarcodeUndo : t.noBarcodeSet}
              </button>
            )}
            <a href={game.url} target="_blank" rel="noreferrer" className="ml-auto text-accent hover:underline">
              {t.zatrolene}
            </a>
          </div>
          {scan === "code" && <BarcodeScanner onCode={onBoxCode} onClose={() => setScan(null)} t={t} />}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="loan-box">
            <span className="text-muted">{t.box}:</span>
            {host !== undefined ? (
              <>
                <span>
                  {t.packedIn}{" "}
                  <button type="button" onClick={() => show(host)} className="text-accent hover:underline">
                    {name(host)}
                  </button>
                </span>
                <button type="button" disabled={pending} onClick={() => pack(game.id, null)} className="text-accent hover:underline">
                  {t.packOut}
                </button>
              </>
            ) : (
              <>
                {shownBundle.length <= 1 && <span className="text-muted">{t.boxAlone}</span>}
                {shownBundle.slice(1).map((id) => (
                  <span key={id} className="inline-flex items-center gap-1">
                    {name(id)}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => pack(id, null)}
                      aria-label={`${t.packOut}: ${name(id)}`}
                      title={t.packOut}
                      className="rounded px-1 text-accent hover:bg-accent/10"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {!packing && (
                  <button type="button" onClick={() => setPacking(true)} className="text-accent hover:underline" data-testid="loan-pack-add">
                    {t.packAdd}
                  </button>
                )}
              </>
            )}
          </div>
          {packing && (
            <div className="flex flex-col gap-2" data-testid="loan-pack">
              <p className="text-sm text-muted">{t.packHint}</p>
              <div className="flex gap-2">
                <input
                  type="search"
                  value={packQuery}
                  onChange={(e) => setPackQuery(e.target.value)}
                  placeholder={t.packSearch}
                  aria-label={t.packSearch}
                  enterKeyHint="search"
                  autoComplete="off"
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setPacking(false);
                    setPackQuery("");
                  }}
                >
                  {t.packCancel}
                </Button>
              </div>
              {packQuery.trim() && (
                <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {packFound.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t.noMatch}</li>}
                  {packFound.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => pack(g.id, game.id)}
                        className="flex w-full flex-wrap items-baseline gap-x-2 px-3 py-2 text-left hover:bg-border/40"
                      >
                        <span className="font-medium">{g.name}</span>
                        {g.year && <span className="text-sm text-muted">({g.year})</span>}
                        {g.expansion && <span className="text-xs text-muted">{t.expansion}</span>}
                        {packedIn[g.id] !== undefined && (
                          <span className="text-xs text-muted">
                            📦 {t.inBoxOf} {name(packedIn[g.id])}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
            {loanRows.map((row) => {
              const [l] = row;
              const games = row.map((r) => r.gameName).join(" + ");
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  {batch ? (
                    <span className="font-medium">{games}</span>
                  ) : (
                    <button type="button" onClick={() => show(l.gameId)} className="text-left font-medium hover:text-accent hover:underline">
                      {row.length > 1 && "📦 "}
                      {games}
                    </button>
                  )}
                  <span>{l.borrower ?? "?"}</span>
                  <span className="text-sm text-muted">
                    {l.since} ({l.age}){l.lentBy && ` · ${l.lentBy}`}
                  </span>
                  {l.note && <span className="basis-full text-sm text-muted">{l.note}</span>}
                  <span className="ml-auto">
                    <Button type="button" variant="secondary" disabled={pending} onClick={() => giveBack(row, true)}>
                      {t.markReturned}
                    </Button>
                  </span>
                </li>
              );
            })}
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
              <input
                type="search"
                value={missingQuery}
                onChange={(e) => setMissingQuery(e.target.value)}
                placeholder={t.missingSearch}
                aria-label={t.missingSearch}
                enterKeyHint="search"
                autoComplete="off"
                className={`${inputClass} mt-2 w-full sm:max-w-sm`}
                data-testid="loan-missing-search"
              />
              {missingShown.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t.noMatch}</p>
              ) : (
                <ul className="mt-2 columns-1 gap-6 text-sm sm:columns-2 lg:columns-3">
                  {missingShown.map(({ game: g, aka }) => (
                    <li key={g.id} className="break-inside-avoid">
                      {boxButton(g, aka)}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </details>
      )}

      {!batch && noCodeBoxes.length > 0 && (
        <details data-testid="loan-no-code">
          <summary className="cursor-pointer font-semibold">
            {t.noCodeList} <span className="font-normal text-muted">({noCodeBoxes.length})</span>
          </summary>
          <p className="mt-2 text-sm text-muted">{t.noCodeListHint}</p>
          <ul className="mt-2 columns-1 gap-6 text-sm sm:columns-2 lg:columns-3">
            {noCodeBoxes.map((g) => (
              <li key={g.id} className="break-inside-avoid">
                {boxButton(g)}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!batch && bundles.length > 0 && (
        <details data-testid="loan-bundles">
          <summary className="cursor-pointer font-semibold">
            {t.bundles} <span className="font-normal text-muted">({bundles.length})</span>
          </summary>
          <p className="mt-2 text-sm text-muted">{t.bundlesHint}</p>
          <ul className="mt-2 columns-1 gap-6 text-sm sm:columns-2 lg:columns-3">
            {bundles.map((g) => (
              <li key={g.id} className="break-inside-avoid">
                {boxButton(g)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
