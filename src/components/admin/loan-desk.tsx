"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { assignBarcodeAction, lendGameAction, removeBarcodeAction, returnLoanAction, type LoanActionResult } from "@/app/actions/loans";
import type { LoansAdminDict } from "@/i18n/loans";
import { normalizeBarcode } from "@/lib/barcode";
import { Alert, Button, inputClass } from "../ui";
import { BarcodeScanner } from "./barcode-scanner";

export type DeskGame = { id: number; name: string; year: number | null; url: string; expansion: boolean; note: string | null };
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

const SHOWN_GAMES = 8;
const SHOWN_PEOPLE = 6;

/** Lower case without diacritics, so "novak" finds "Novák". */
function fold(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Whether every word typed starts a word of `text`: "jan nov" finds "Jana Nováková". */
function matches(text: string, query: string) {
  const words = fold(text).split(/[\s:,.()–-]+/);
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((q) => words.some((w) => w.startsWith(q)));
}

type Notice = { kind: "success" | "error" | "info"; text: string };

/**
 * Admin → Půjčovna: find a game by the bar code on its box (the phone's camera, or the digits typed – a USB reader
 * types them too) or by its name, then lend it or take it back. An unknown code goes to the game picked next.
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
  t: LoansAdminDict["desk"];
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(initialGameId);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [borrower, setBorrower] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const search = useRef<HTMLInputElement>(null);

  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const gameByCode = useMemo(() => new Map(codes.map((c) => [c.code, c.gameId])), [codes]);
  const loanByGame = useMemo(() => new Map(loans.map((l) => [l.gameId, l])), [loans]);

  const game = selectedId !== null ? gameById.get(selectedId) : undefined;
  const loan = game ? loanByGame.get(game.id) : undefined;
  const gameCodes = game ? codes.filter((c) => c.gameId === game.id).map((c) => c.code) : [];

  // digits only, as many as on a box: a name like "1775: Rebellion" is still searched by its first digits
  const looksLikeCode = /^\d{8,}$/.test(query.replace(/[\s-]/g, ""));
  const found = query.trim() && !looksLikeCode ? games.filter((g) => matches(g.name, query)).slice(0, SHOWN_GAMES) : [];
  const suggested =
    borrower.trim() && !people.some((p) => p === borrower.trim()) ? people.filter((p) => matches(p, borrower)).slice(0, SHOWN_PEOPLE) : [];

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
  };

  /** A game picked from the search; the code read just before belongs to it. */
  const pick = (id: number) => {
    select(id);
    setNotice(null);
    if (pendingCode) {
      const code = pendingCode;
      setPendingCode(null);
      run(() => assignBarcodeAction({ code, gameId: id }));
    }
  };

  const onCode = (raw: string) => {
    setScanning(false);
    const code = normalizeBarcode(raw);
    if (!code) return setNotice({ kind: "error", text: t.badCode });
    const id = gameByCode.get(code);
    if (id !== undefined && gameById.has(id)) {
      setPendingCode(null);
      setNotice(null);
      return select(id);
    }
    select(null);
    setPendingCode(code);
    setNotice({ kind: "info", text: t.unknownCode.replace("{code}", code) });
    search.current?.focus();
  };

  const lend = () => {
    if (!game) return;
    const id = game.id;
    run(() => lendGameAction({ gameId: id, borrower, note }), () => select(null));
  };

  const giveBack = (l: DeskLoan, ask: boolean) => {
    if (ask && !confirm(t.returnConfirm.replace("{game}", l.gameName))) return;
    run(() => returnLoanAction(l.id), () => {
      if (selectedId === l.gameId) select(null);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        {scanning ? (
          <BarcodeScanner onCode={onCode} onClose={() => setScanning(false)} t={t} />
        ) : (
          <div>
            <Button type="button" onClick={() => setScanning(true)} data-testid="loan-scan">
              {t.scan}
            </Button>
          </div>
        )}

        <label className="flex flex-col gap-1 text-sm font-medium">
          {t.search}
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (looksLikeCode) onCode(query);
              else if (found[0]) pick(found[0].id);
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
                  setPendingCode(null);
                  setNotice(null);
                }}
              >
                {t.dropCode}
              </Button>
            )}
          </div>
        )}

        {query.trim() && !looksLikeCode && (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border" data-testid="loan-found">
            {found.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t.noMatch}</li>}
            {found.map((g) => (
              <li key={g.id}>
                <button type="button" onClick={() => pick(g.id)} className="flex w-full flex-wrap items-baseline gap-x-2 px-3 py-2 text-left hover:bg-border/40">
                  <span className="font-medium">{g.name}</span>
                  {g.year && <span className="text-sm text-muted">({g.year})</span>}
                  {g.expansion && <span className="text-xs text-muted">{t.expansion}</span>}
                  {loanByGame.has(g.id) && <span className="ml-auto text-xs font-medium text-accent">{t.lent}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {game && (
        <section className="flex flex-col gap-3 rounded-lg border border-border p-4" data-testid="loan-game">
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
            <a href={game.url} target="_blank" rel="noreferrer" className="ml-auto text-accent hover:underline">
              {t.zatrolene}
            </a>
          </div>
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
                <button type="button" onClick={() => select(l.gameId)} className="font-medium hover:text-accent hover:underline">
                  {l.gameName}
                </button>
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
    </div>
  );
}
