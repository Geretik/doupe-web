"use client";

import Link from "next/link";
import { createGrimoireAction } from "@/app/actions/grimoire";
import type { GameWinner } from "@/db/schema";
import { endGame, reopenGame } from "@/lib/grimoire/state";
import { fill } from "@/lib/grimoire/text";
import { useGrimoire } from "./context";
import { DeleteGrimoireButton } from "./delete-grimoire";

const button = "min-h-12 rounded-lg border px-3 py-2 text-sm font-semibold";

/** The game as a whole: who won (which writes the session's game record), back into it, the next game, delete. */
export function GamePanel({
  id,
  session,
  recorded,
  canEdit,
  canDelete,
}: {
  id: number;
  session: { id: number; title: string } | null;
  /** The game record was written (now or before) */
  recorded: boolean;
  canEdit: boolean;
  /** An administrator's */
  canDelete: boolean;
}) {
  const { state, update, readOnly, t } = useGrimoire();
  const end = (winner: GameWinner | null) => update((s) => endGame(s, winner));

  return (
    <div className="flex flex-col gap-4" data-testid="game-panel">
      {session && (
        <p className="text-sm">
          {t.sessionLabel}{" "}
          <Link href={`/admin/termin/${session.id}#hry`} className="font-medium underline hover:text-accent">
            {session.title}
          </Link>
        </p>
      )}

      {state.phase !== "ended" ? (
        !readOnly && (
          <section className="flex flex-col gap-2">
            <h3 className="text-lg font-bold">{t.endTitle}</h3>
            <p className="text-sm text-muted">{session ? fill(t.endRecords, { title: session.title }) : t.endNoSession}</p>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className={`${button} border-good bg-good/10 text-good`} onClick={() => end("good")}>
                😇 {t.winGood}
              </button>
              <button type="button" className={`${button} border-accent bg-accent/10 text-accent`} onClick={() => end("evil")}>
                😈 {t.winEvil}
              </button>
              <button type="button" className={`${button} border-border bg-card`} onClick={() => end(null)}>
                {t.winUnknown}
              </button>
            </div>
          </section>
        )
      ) : (
        <section className="flex flex-col gap-2">
          <h3 className="text-lg font-bold">
            {state.winner === "good" ? `😇 ${t.wonGood}` : state.winner === "evil" ? `😈 ${t.wonEvil}` : t.endedNoWinner}
          </h3>
          {session && recorded && (
            <Link href={`/admin/termin/${session.id}#hry`} className="text-sm font-medium underline hover:text-accent" data-testid="recorded">
              {t.recorded}
            </Link>
          )}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={`${button} border-border bg-card`} onClick={() => update(reopenGame)}>
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
        </section>
      )}

      {canDelete && (
        <div className="border-t border-border pt-3">
          <DeleteGrimoireButton id={id} label={t.delete} confirmText={t.deleteConfirm} />
        </div>
      )}
    </div>
  );
}
