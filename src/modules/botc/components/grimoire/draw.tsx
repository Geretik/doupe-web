"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { findRole } from "@/modules/botc/lib/botc-roles";
import { drawFor, endDrawing, playerSeats, remainingBag, takeDrawn } from "@/modules/botc/lib/grimoire/state";
import { fill } from "@/modules/botc/lib/grimoire/text";
import { groupHeadingClass } from "@/modules/botc/components/draft/team-section";
import { nameOf, RoleIcon, useGrimoire } from "./context";
import { Town } from "./town";

type Open = { seatId: string; taken: boolean; shown: boolean; roleId: string | null };

const big = "min-h-14 rounded-xl px-6 text-lg font-semibold";

/**
 * The players draw their characters from the bag: the tablet goes round, each player taps their own place
 * and sees their character on a screen of its own, then hides it again. Nothing else of the grimoire shows.
 * Before anyone has drawn, the Storyteller reads how it goes; once the bag is empty, the end is theirs.
 */
export function DrawView() {
  const { state, update, ask, characters, locale, t, scriptNames } = useGrimoire();
  const [open, setOpen] = useState<Open | null>(null);
  const [guide, setGuide] = useState(() => !playerSeats(state).some((s) => s.role));
  const left = remainingBag(state).length;

  const tap = (seatId: string) => {
    const seat = state.seats.find((s) => s.id === seatId);
    if (!seat || seat.gap) return;
    setOpen({ seatId, taken: seat.role !== null, shown: false, roleId: null });
  };
  const reveal = () => {
    if (!open) return;
    const roleId = drawFor(state, open.seatId);
    if (roleId) update((s) => takeDrawn(s, open.seatId, roleId));
    setOpen({ ...open, shown: true, roleId });
  };
  const end = async () => {
    if (await ask(t.drawEndConfirm)) update(endDrawing);
  };
  const role = findRole(open?.roleId);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold">{t.drawTitle}</h1>
        <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-sm font-semibold" data-testid="draw-left">
          {fill(t.drawLeft, { n: left })}
        </span>
        <button
          type="button"
          onClick={end}
          className={`ml-auto min-h-11 rounded-lg border px-3 text-sm ${
            left === 0 ? "border-accent bg-accent font-semibold text-accent-foreground ring-4 ring-accent/40 motion-safe:animate-pulse" : "border-border bg-card"
          }`}
        >
          {t.drawEnd}
        </button>
      </div>
      {guide ? (
        <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto py-2">
          <div className="my-auto flex max-w-xl flex-col gap-4 rounded-xl border border-accent/50 bg-accent/10 p-5" data-testid="draw-guide">
            <h2 className="text-lg font-bold">{t.drawGuideTitle}</h2>
            <ol className="flex list-decimal flex-col gap-2 pl-5">
              {t.drawGuide.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <button type="button" className={`${big} self-center bg-accent text-accent-foreground`} onClick={() => setGuide(false)}>
              {t.drawGuideStart}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className={left === 0 ? "font-semibold text-accent" : "text-muted"}>{left === 0 ? t.drawAllDone : t.drawHint}</p>
          <div className="relative min-h-0 flex-1">
            <Town hideRoles selectedId={null} highlightIds={[]} onSelect={tap} center={<span className="text-xl font-bold">{fill(t.drawLeft, { n: left })}</span>} />
          </div>
        </>
      )}

      {open &&
        // over the whole screen: the admin's column is transformed, which would trap a fixed box inside it
        createPortal(
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background p-6 text-center" role="dialog" aria-modal="true" data-testid="draw-dialog">
            {open.taken ? (
              <>
                <p className="max-w-md text-lg">{t.drawTaken}</p>
                <button type="button" className={`${big} border border-border bg-card`} onClick={() => setOpen(null)}>
                  {t.drawBack}
                </button>
              </>
            ) : !open.shown ? (
              <>
                <button type="button" className="min-h-40 w-full max-w-md rounded-xl bg-accent px-6 text-2xl font-semibold text-accent-foreground" onClick={reveal}>
                  {t.drawCover}
                </button>
                <p className="text-muted">{t.drawCoverHint}</p>
                <button type="button" className={`${big} border border-border bg-card`} onClick={() => setOpen(null)}>
                  {t.drawBack}
                </button>
              </>
            ) : role ? (
              <>
                <p className="text-muted">{t.drawGot}</p>
                <RoleIcon roleId={role.id} size={160} />
                <p className={`text-4xl font-bold ${groupHeadingClass(role.team)}`} data-testid="drawn-role">
                  {nameOf(role.id, locale, scriptNames)}
                </p>
                <p className={`text-sm font-semibold tracking-wide uppercase ${groupHeadingClass(role.team)}`}>{t.teams[role.team]}</p>
                {characters[role.id] && <p className="max-w-md text-lg leading-snug">{characters[role.id].ability}</p>}
                <button type="button" className={`${big} bg-accent text-accent-foreground`} onClick={() => setOpen(null)}>
                  {t.drawHide}
                </button>
              </>
            ) : (
              <>
                <p className="text-lg">{t.drawEmpty}</p>
                <button type="button" className={`${big} border border-border bg-card`} onClick={() => setOpen(null)}>
                  {t.drawBack}
                </button>
              </>
            )}
          </div>,
        document.body,
      )}
    </>
  );
}
