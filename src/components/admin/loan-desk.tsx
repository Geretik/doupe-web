"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { lendGamesAction, returnLoansAction } from "@/app/actions/loans";
import { boxOf, type PackedIn } from "@/lib/game-boxes";
import { matchesWords } from "@/lib/game-match";
import { Button, inputClass } from "../ui";
import { BarcodeScanner } from "./barcode-scanner";
import { bundleIn, FinderFields, useGameFinder, type Desk, type DeskGame } from "./game-finder";

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

const SHOWN_PEOPLE = 6;

/** The word for `n` things: [1, 2–4, 5+] */
function plural(n: number, [one, few, many]: string[]) {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}

/** The camera on: finding one game, or reading box after box to lend */
type Scan = "find" | "batch" | null;

/** Who borrows, suggested from the attendance sheet and earlier loans; `label` false when a heading says it already. */
function BorrowerField({
  borrower,
  setBorrower,
  people,
  label = true,
  t,
}: {
  borrower: string;
  setBorrower: (name: string) => void;
  people: string[];
  label?: boolean;
  t: Desk;
}) {
  const suggested =
    borrower.trim() && !people.some((p) => p === borrower.trim()) ? people.filter((p) => matchesWords(p, borrower)).slice(0, SHOWN_PEOPLE) : [];
  const input = (
    <input
      value={borrower}
      onChange={(e) => setBorrower(e.target.value)}
      placeholder={t.borrowerPlaceholder}
      aria-label={label ? undefined : t.borrower}
      required
      maxLength={200}
      autoComplete="off"
      className={inputClass}
      data-testid="loan-borrower"
    />
  );
  return (
    <>
      {label ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t.borrower}
          {input}
        </label>
      ) : (
        input
      )}
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
    </>
  );
}

function NoteField({ note, setNote, t }: { note: string; setNote: (note: string) => void; t: Desk }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {t.note}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.notePlaceholder} maxLength={500} autoComplete="off" className={inputClass} />
    </label>
  );
}

/** A numbered step of lending several games */
function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h4 className="flex items-center gap-2 font-semibold">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-sm text-accent-foreground" aria-hidden>
          {n}
        </span>
        {title}
      </h4>
      {hint && <p className="-mt-2 text-sm text-muted">{hint}</p>}
      {children}
    </section>
  );
}

/**
 * Admin → Půjčovna: find a game by the bar code on its box (the phone's camera, or the digits typed – a USB reader
 * types them too) or by its name, then lend it or take it back; or lend several games to one person, box after box.
 * An unknown code goes to the game picked next, GameUPC suggesting which. Games in one box (an expansion built into
 * the base game) are a bundle, lent and returned together. The codes and boxes themselves are kept in the library
 * (game-library.tsx).
 */
export function LoanDesk({
  games,
  codes,
  packedIn,
  loans,
  last,
  people,
  initialGameId,
  t,
}: {
  games: DeskGame[];
  codes: { code: string; gameId: number }[];
  packedIn: PackedIn;
  loans: DeskLoan[];
  /** Who had the game last, by game: "Petr Svoboda, 1. 10. – 5. 10." */
  last: Record<number, string>;
  /** Names to suggest, the latest seen first */
  people: string[];
  initialGameId: number | null;
  t: Desk;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(initialGameId);
  const [scan, setScan] = useState<Scan>(null);
  const [borrower, setBorrower] = useState("");
  const [note, setNote] = useState("");
  /** The games to lend to one person at once; null when lending one */
  const [batch, setBatch] = useState<number[] | null>(null);
  /** The game of the list added or read again last, picked out on it */
  const [lastChosen, setLastChosen] = useState<number | null>(null);
  /** The games of the bundle shown not to lend this time (unticked) */
  const [skip, setSkip] = useState<number[]>([]);
  const gameSection = useRef<HTMLElement>(null);

  const loanByGame = useMemo(() => new Map(loans.map((l) => [l.gameId, l])), [loans]);
  const lent = useMemo(() => new Set(loanByGame.keys()), [loanByGame]);
  const chosen = useMemo(() => new Set(batch ?? []), [batch]);

  /** Shows a game, with an empty lending form. */
  const select = (id: number | null) => {
    setSelectedId(id);
    finder.setQuery("");
    setBorrower("");
    setNote("");
    setSkip([]);
  };

  /** A game to lend with the others, with the games of its box; one already out is not added. */
  const addToBatch = (id: number) => {
    const g = finder.gameById.get(id);
    if (!g) return;
    const out = loanByGame.get(id);
    if (out) return finder.setNotice({ kind: "error", text: t.batchOut.replace("{game}", g.name).replace("{who}", out.borrower ?? "?") });
    setLastChosen(id);
    if (chosen.has(id)) return finder.setNotice({ kind: "info", text: t.batchAlready.replace("{game}", g.name) });
    const more = bundle(id).filter((x) => x !== id && !loanByGame.has(x) && !chosen.has(x));
    setBatch((b) => [...(b ?? []), id, ...more]);
    finder.setNotice({ kind: "success", text: t.batchAdded.replace("{game}", [id, ...more].map(name).join(", ")) });
  };

  const finder = useGameFinder({
    games,
    codes,
    t,
    onGame: (id) => (batch ? addToBatch(id) : select(id)),
    onUnknown: () => {
      if (!batch) select(null);
    },
  });
  const { gameById, setNotice, pending, run } = finder;

  const bundle = (id: number) => bundleIn(id, packedIn, gameById);
  const name = (id: number) => gameById.get(id)?.name ?? "?";

  const game = selectedId !== null && !batch ? gameById.get(selectedId) : undefined;
  const loan = game ? loanByGame.get(game.id) : undefined;
  // the bundle of the game shown: lent together (but the games unticked), back together from one who has them all
  const shownBundle = game ? bundle(game.id) : [];
  const lendIds = shownBundle.filter((id) => !loanByGame.has(id) && !skip.includes(id));
  const together = loan ? loans.filter((l) => shownBundle.includes(l.gameId) && l.borrower === loan.borrower) : [];

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

  /** A game from a list further down: shown, and scrolled to. */
  const show = (id: number) => {
    select(id);
    setNotice(null);
    requestAnimationFrame(() => gameSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  /** A code read by the camera: looking for one game, the camera closes. */
  const onCode = (raw: string) => {
    if (scan === "find") setScan(null);
    finder.onCode(raw);
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

  return (
    <div className="flex flex-col gap-5">
      {batch ? (
        <section className="flex flex-col gap-5 rounded-lg border-2 border-accent/50 p-4" data-testid="loan-batch">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">{t.batchTitle}</h3>
            <button type="button" onClick={endBatch} className="text-sm text-accent hover:underline">
              {t.batchCancel}
            </button>
          </div>
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              lendBatch();
            }}
          >
            <Step n={1} title={t.batchWho}>
              <BorrowerField borrower={borrower} setBorrower={setBorrower} people={people} label={false} t={t} />
            </Step>

            <Step n={2} title={t.batchWhat} hint={t.batchHint}>
              {scan ? (
                <BarcodeScanner key={scan} onCode={onCode} onClose={() => setScan(null)} continuous t={t} />
              ) : (
                <div>
                  <Button type="button" onClick={() => setScan("batch")} data-testid="loan-scan">
                    {t.batchScan}
                  </Button>
                </div>
              )}
              <FinderFields finder={finder} packedIn={packedIn} chosen={chosen} lent={lent} t={t} />
              <div className="flex flex-col gap-2 rounded-md bg-border/30 p-3">
                <p className="text-sm font-medium">
                  {t.batchChosen} <span className="font-normal text-muted">({batch.length})</span>
                </p>
                {batch.length === 0 ? (
                  <p className="text-sm text-muted">{t.batchEmpty}</p>
                ) : (
                  <ul className="flex flex-col gap-2" data-testid="loan-batch-games">
                    {batch.flatMap((id) => {
                      const g = gameById.get(id);
                      return g ? (
                        <li
                          key={id}
                          // the one added or read again last stands out
                          aria-current={id === lastChosen ? "true" : undefined}
                          className={`flex items-center gap-x-2 rounded-md border bg-card px-3 py-2 transition-colors ${
                            id === lastChosen ? "border-accent ring-1 ring-accent" : "border-border"
                          }`}
                        >
                          <span className="font-bold text-accent" aria-hidden>
                            ✓
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{g.name}</span>
                            {g.year && <span className="ml-2 text-sm text-muted">({g.year})</span>}
                            {g.expansion && <span className="ml-2 text-xs text-muted">{t.expansion}</span>}
                            {packedIn[id] !== undefined && (
                              <span className="ml-2 text-xs text-muted">
                                📦 {t.inBoxOf} {name(packedIn[id])}
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => setBatch((b) => b && b.filter((x) => x !== id))}
                            aria-label={`${t.batchRemove} ${g.name}`}
                            title={t.batchRemove}
                            className="shrink-0 rounded px-2 py-1 text-accent hover:bg-accent/10"
                          >
                            ✕
                          </button>
                        </li>
                      ) : [];
                    })}
                  </ul>
                )}
              </div>
            </Step>

            <Step n={3} title={t.batchFinish}>
              <NoteField note={note} setNote={setNote} t={t} />
              <div>
                <Button type="submit" disabled={pending || batch.length === 0} data-testid="loan-batch-lend">
                  {pending
                    ? t.working
                    : t.batchLend.replace("{n}", `${batch.length} ${plural(batch.length, t.games)}`) + (borrower.trim() ? ` → ${borrower.trim()}` : "")}
                </Button>
              </div>
            </Step>
          </form>
        </section>
      ) : (
        <div className="flex flex-col gap-3">
          {scan ? (
            <BarcodeScanner key={scan} onCode={onCode} onClose={() => setScan(null)} t={t} />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setScan("find")} data-testid="loan-scan">
                {t.scan}
              </Button>
              <Button type="button" variant="secondary" onClick={startBatch} data-testid="loan-batch-start">
                {t.batchStart}
              </Button>
            </div>
          )}
          <FinderFields finder={finder} packedIn={packedIn} lent={lent} t={t} />
        </div>
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
              <BorrowerField borrower={borrower} setBorrower={setBorrower} people={people} t={t} />
              <NoteField note={note} setNote={setNote} t={t} />
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

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
            <Link href={`/admin/pujcovna/knihovna?hra=${game.id}`} className="text-accent hover:underline" data-testid="loan-to-library">
              {t.toLibrary}
            </Link>
            <a href={game.url} target="_blank" rel="noreferrer" className="ml-auto text-accent hover:underline">
              {t.zatrolene}
            </a>
          </div>
        </section>
      )}

      {!batch && (
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
                const names = row.map((r) => r.gameName).join(" + ");
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <button type="button" onClick={() => show(l.gameId)} className="text-left font-medium hover:text-accent hover:underline">
                      {row.length > 1 && "📦 "}
                      {names}
                    </button>
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
      )}
    </div>
  );
}
