"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createGrimoireAction } from "@/app/actions/grimoire";
import type { GameWinner } from "@/db/schema";
import { endGame, reopenGame } from "@/lib/grimoire/state";
import { fill } from "@/lib/grimoire/text";
import { useGrimoire } from "./context";
import { chronicleText } from "./chronicle";
import { DeleteGrimoireButton } from "./delete-grimoire";

const button = "min-h-12 rounded-lg border px-3 py-2 text-sm font-semibold";
/** As long as the game form's note */
const NOTES_MAX = 1000;

type GameProps = {
  id: number;
  session: { id: number; title: string } | null;
  /** The game record was written (now or before) */
  recorded: boolean;
  canEdit: boolean;
  /** An administrator's */
  canDelete: boolean;
};

/** At the bottom of the grimoire's panel: ends the game in a dialog, and once it is over shows who won. */
export function GameButton(props: GameProps) {
  const { state, readOnly, t } = useGrimoire();
  const [open, setOpen] = useState(false);
  const ended = state.phase === "ended";
  // someone else's game that is still going: nothing to end or see here
  if (!ended && readOnly && !props.canDelete) return null;
  const label = !ended ? t.endTitle : state.winner === "good" ? `😇 ${t.wonGood}` : state.winner === "evil" ? `😈 ${t.wonEvil}` : t.endedNoWinner;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 w-full rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:border-accent/50"
        data-testid="game-button"
      >
        🏁 {label}
      </button>
      {open &&
        // over the whole screen: the admin's column is transformed, which would trap a fixed box inside it
        createPortal(<GameDialog {...props} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

/** Who won and a note on the game, which writes the session's game record; once over: back into it, the next game, delete. */
function GameDialog({ id, session, recorded, canEdit, canDelete, onClose }: GameProps & { onClose: () => void }) {
  const { state, update, readOnly, locale, t } = useGrimoire();
  const [winner, setWinner] = useState<GameWinner | "unknown" | null>(null);
  // a game ended for the first time: the note starts as the chronicle
  const [fromChronicle] = useState(() => (state.notes === undefined ? chronicleText(state, locale, t, NOTES_MAX) : ""));
  const [notes, setNotes] = useState(state.notes ?? fromChronicle);
  const ended = state.phase === "ended";
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const choices: { value: GameWinner | "unknown"; label: string; className: string }[] = [
    { value: "good", label: `😇 ${t.winGood}`, className: "border-good text-good" },
    { value: "evil", label: `😈 ${t.winEvil}`, className: "border-accent text-accent" },
    { value: "unknown", label: t.winUnknown, className: "border-border" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.endTitle}
        className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="game-panel"
      >
        {session && (
          <p className="text-sm">
            {t.sessionLabel}{" "}
            <Link href={`/admin/termin/${session.id}#hry`} className="font-medium underline hover:text-accent">
              {session.title}
            </Link>
          </p>
        )}

        {!ended ? (
          !readOnly && (
            <>
              <h2 className="text-xl font-bold">{t.endTitle}</h2>
              <p className="text-sm text-muted">{session ? fill(t.endRecords, { title: session.title }) : t.endNoSession}</p>
              {state.seats.some((s) => s.role === "heretic") && <p className="text-sm font-medium text-accent">⚠️ {t.hereticEnd}</p>}
              {state.seats.some((s) => s.role === "politician") && <p className="text-sm font-medium text-accent">⚠️ {t.politicianEnd}</p>}
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-semibold">{t.whoWon}</legend>
                <div className="grid grid-cols-3 gap-2">
                  {choices.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      aria-pressed={winner === c.value}
                      onClick={() => setWinner(c.value)}
                      className={`${button} ${c.className} ${winner === c.value ? "bg-border/60 ring-2 ring-current" : "bg-card"}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                {t.gameNotes}
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={NOTES_MAX}
                  rows={4}
                  placeholder={t.gameNotesPlaceholder}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-base font-normal"
                />
                {fromChronicle && <span className="text-xs font-normal text-muted">{t.gameNotesChronicle}</span>}
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!winner}
                  onClick={() => winner && update((s) => endGame(s, winner === "unknown" ? null : winner, notes.trim()))}
                  className={`${button} flex-1 border-accent bg-accent text-accent-foreground disabled:opacity-40`}
                >
                  {t.endConfirm}
                </button>
                <button type="button" onClick={onClose} className={`${button} border-border bg-card`}>
                  {t.cancel}
                </button>
              </div>
            </>
          )
        ) : (
          <>
            <h2 className="text-xl font-bold">
              {state.winner === "good" ? `😇 ${t.wonGood}` : state.winner === "evil" ? `😈 ${t.wonEvil}` : t.endedNoWinner}
            </h2>
            {state.notes && <p className="text-sm whitespace-pre-line">{state.notes}</p>}
            {session && recorded && (
              <Link href={`/admin/termin/${session.id}#hry`} className="text-sm font-medium underline hover:text-accent" data-testid="recorded">
                {t.recorded}
              </Link>
            )}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${button} border-border bg-card`}
                  onClick={() => {
                    update(reopenGame);
                    onClose();
                  }}
                >
                  {t.reopen}
                </button>
                <form action={createGrimoireAction}>
                  <input type="hidden" name="fromId" value={id} />
                  <button type="submit" className={`${button} border-accent bg-accent text-accent-foreground`}>
                    {t.nextGame}
                  </button>
                </form>
              </div>
            )}
          </>
        )}

        {(canDelete || ended || readOnly) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {canDelete && <DeleteGrimoireButton id={id} label={t.delete} confirmText={t.deleteConfirm} />}
            {(ended || readOnly) && (
              <button type="button" onClick={onClose} className={`${button} ml-auto border-border bg-card`}>
                {t.close}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
