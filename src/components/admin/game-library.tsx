"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { assignBarcodeAction, packGameAction, removeBarcodeAction, setNoBarcodeAction } from "@/app/actions/loans";
import { normalizeBarcode } from "@/lib/barcode";
import { boxesWithCode, boxOf, type PackedIn } from "@/lib/game-boxes";
import { Button, inputClass } from "../ui";
import { BarcodeScanner } from "./barcode-scanner";
import { bundleIn, FinderFields, matchOf, SHOWN_GAMES, useGameFinder, type Desk, type DeskGame } from "./game-finder";

/** The camera on: finding a game, or reading the code of the game shown */
type Scan = "find" | "code" | null;

/**
 * Admin → Půjčovna → Správa knihovny: the bar codes of the boxes, so that Půjčovna finds a game by one. A game is
 * found by a code or its name; the code read next goes to the game shown, an unknown code to the game picked next.
 * The games whose code we don't know are listed at the bottom. A box without a code is marked so and found by its
 * name only. Games in one box (an expansion built into the base game) are a bundle: a code of any of them finds it.
 */
export function GameLibrary({
  games,
  codes,
  noBarcode,
  packedIn,
  initialGameId,
  t,
}: {
  games: DeskGame[];
  codes: { code: string; gameId: number }[];
  /** The games whose box has no bar code (the box's game of a bundle) */
  noBarcode: number[];
  packedIn: PackedIn;
  initialGameId: number | null;
  t: Desk;
}) {
  /** The search in the list of games without a code */
  const [missingQuery, setMissingQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(initialGameId);
  const [scan, setScan] = useState<Scan>(null);
  /** Choosing a game to put in the box of the game shown */
  const [packing, setPacking] = useState(false);
  const [packQuery, setPackQuery] = useState("");
  const gameSection = useRef<HTMLElement>(null);

  /** Shows a game. */
  const select = (id: number | null) => {
    setSelectedId(id);
    finder.setQuery("");
    setPacking(false);
    setPackQuery("");
    // the camera reading a code for the game shown was for that game
    setScan((s) => (s === "code" ? null : s));
  };

  const finder = useGameFinder({ games, codes, t, onGame: select, onUnknown: () => select(null) });
  const { gameById, gameByCode, setNotice, pending, run } = finder;
  const marked = useMemo(() => new Set(noBarcode), [noBarcode]);
  const withCode = useMemo(() => boxesWithCode(codes, packedIn), [codes, packedIn]);

  const bundle = (id: number) => bundleIn(id, packedIn, gameById);
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

  const game = selectedId !== null ? gameById.get(selectedId) : undefined;
  const gameCodes = game ? codes.filter((c) => c.gameId === game.id).map((c) => c.code) : [];
  const shownBundle = game ? bundle(game.id) : [];
  const host = game ? packedIn[game.id] : undefined;
  const boxCovered = game ? withCode.has(boxOf(game.id, packedIn)) : false;
  const boxMarked = game ? marked.has(boxOf(game.id, packedIn)) : false;
  // games to put in its box: not itself, not in it already, not a box with games of its own (boxes don't nest)
  const packFound =
    game && packQuery.trim()
      ? games
          .filter((g) => g.id !== game.id && packedIn[g.id] !== game.id && !(bundle(g.id).length > 1 && boxOf(g.id, packedIn) === g.id) && matchOf(g, packQuery) !== null)
          .slice(0, SHOWN_GAMES)
      : [];

  /** A game from a list further down: shown, and scrolled to. */
  const show = (id: number) => {
    select(id);
    setNotice(null);
    requestAnimationFrame(() => gameSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  /** A code read by the camera to find a game: the camera closes. */
  const onCode = (raw: string) => {
    setScan(null);
    finder.onCode(raw);
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

  const pack = (id: number, box: number | null) =>
    run(() => packGameAction({ gameId: id, box }), () => {
      setPacking(false);
      setPackQuery("");
    });

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
        {scan === "find" ? (
          <BarcodeScanner onCode={onCode} onClose={() => setScan(null)} t={t} />
        ) : (
          <div>
            <Button type="button" onClick={() => setScan("find")} data-testid="loan-scan">
              {t.scan}
            </Button>
          </div>
        )}
        <FinderFields finder={finder} packedIn={packedIn} t={t} />
      </div>

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

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
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

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
            <Link href={`/admin/pujcovna?hra=${game.id}`} className="text-accent hover:underline" data-testid="loan-to-desk">
              {t.toDesk}
            </Link>
            <a href={game.url} target="_blank" rel="noreferrer" className="ml-auto text-accent hover:underline">
              {t.zatrolene}
            </a>
          </div>
        </section>
      )}

      <details open data-testid="loan-missing">
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

      {noCodeBoxes.length > 0 && (
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

      {bundles.length > 0 && (
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
