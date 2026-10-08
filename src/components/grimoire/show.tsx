"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { findRole } from "@/lib/botc-roles";
import { players } from "@/lib/grimoire/state";
import { nextPlayer, showTitles, youAreCard, type ShowCard, type ShowLine, type ShowTitle } from "@/lib/grimoire/show";
import { fill } from "@/lib/grimoire/text";
import { groupHeadingClass } from "@/components/draft/team-section";
import { nameOf, RoleIcon, useGrimoire } from "./context";
import { RoleGrid } from "./role-grid";

const chip = "flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm";
const add = "min-h-10 rounded-full border border-dashed border-border px-3 text-sm text-muted hover:border-accent/50 hover:text-foreground";

/** "Show the player" under a night step or at a player: opens the card to show. */
export function ShowButton({ card, label }: { card: ShowCard; label?: string }) {
  const { show, t } = useGrimoire();
  return (
    <button
      type="button"
      onClick={() => show(card)}
      className="min-h-11 rounded-lg border border-accent bg-card px-3 text-sm font-semibold text-accent hover:bg-accent/10"
      data-testid="show-button"
    >
      👁️ {label ?? t.show.button}
    </button>
  );
}

/**
 * The card for a player over the whole screen. First the Storyteller's side: the card as it will look, with
 * what can be changed (headings, characters, players, a number, yes or no, a side, a text). "Show" leaves only
 * the card, dark, for the player's eyes; a tap anywhere comes back to the Storyteller's side, never into the grimoire.
 */
export function ShowScreen({ card, onChange, onClose }: { card: ShowCard; onChange: (card: ShowCard) => void; onClose: () => void }) {
  const { state, characters, t } = useGrimoire();
  const [shown, setShown] = useState(false);
  const names = (seatIds: string[]) => seatIds.map((id) => state.seats.find((s) => s.id === id)?.name || "?");
  const next = card.youAre ? nextPlayer(state, card.youAre) : null;
  const setLine = (i: number, change: (line: ShowLine) => ShowLine) => onChange({ ...card, lines: card.lines.map((l, k) => (k === i ? change(l) : l)) });

  return createPortal(
    shown ? (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setShown(false)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " " || e.key === "Escape") && setShown(false)}
        className="night-card fixed inset-0 z-50 flex flex-col items-center justify-center gap-10 overflow-y-auto bg-background p-6 text-center text-foreground"
        aria-label={t.show.hide}
        data-testid="show-card"
      >
        {card.lines.map((line, i) => (
          <CardLine key={i} line={line} names={names(line.seatIds)} />
        ))}
      </div>
    ) : (
      <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true" aria-label={t.show.title} data-testid="show-screen">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-8">
          <h2 className="text-lg font-bold">{t.show.title}</h2>
          {card.forSeatIds.length > 0 && <span className="text-muted">{fill(t.show.forPlayers, { names: names(card.forSeatIds).join(", ") })}</span>}
          <button type="button" onClick={onClose} className="ml-auto min-h-11 rounded-lg border border-border bg-card px-4 text-sm font-medium">
            {t.show.close}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-8">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            <p className="text-sm text-muted">{t.show.hint}</p>
            {card.lines.map((line, i) => (
              <LineEditor
                key={i}
                line={line}
                onChange={(change) => setLine(i, change)}
                onRemove={card.lines.length > 1 ? () => onChange({ ...card, lines: card.lines.filter((_, k) => k !== i) }) : undefined}
              />
            ))}
            <button type="button" className={`${add} self-start`} onClick={() => onChange({ ...card, lines: [...card.lines, { title: null, roles: [], seatIds: [] }] })}>
              {t.show.addLine}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3 sm:px-8">
          {next && (
            <button
              type="button"
              onClick={() => onChange(youAreCard(state, next, characters))}
              className="min-h-14 rounded-xl border border-border bg-card px-4 font-medium"
              data-testid="show-next"
            >
              {fill(t.show.next, { name: next.name || "?" })}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShown(true)}
            className="min-h-14 flex-1 rounded-xl bg-accent px-6 text-lg font-semibold text-accent-foreground"
          >
            {t.show.show}
          </button>
        </div>
      </div>
    ),
    document.body,
  );
}

/** One line of the card as the player sees it: heading, players, characters, then a number, yes or no, a side, a text. */
function CardLine({ line, names }: { line: ShowLine; names: string[] }) {
  const { characters, locale, t } = useGrimoire();
  const big = line.roles.length < 3;
  return (
    <div className="flex flex-col items-center gap-4" data-testid="show-line">
      {line.title && <p className="text-2xl font-semibold sm:text-3xl">{t.show.titles[line.title]}</p>}
      {names.length > 0 && <p className="text-4xl font-bold sm:text-5xl">{names.join(" · ")}</p>}
      {line.roles.length > 0 && (
        <div className="flex flex-wrap justify-center gap-6">
          {line.roles.map((id) => {
            const team = findRole(id)?.team;
            return (
              <div key={id} className="flex max-w-xs flex-col items-center gap-2">
                <RoleIcon roleId={id} size={big ? 160 : 112} />
                <span className={`text-3xl font-bold sm:text-4xl ${team ? groupHeadingClass(team) : ""}`}>{nameOf(id, locale)}</span>
                {line.title === "youAre" && characters[id] && <span className="text-lg leading-snug">{characters[id].ability}</span>}
              </div>
            );
          })}
        </div>
      )}
      {"number" in line && <p className="text-9xl font-bold tabular-nums">{line.number ?? "?"}</p>}
      {"answer" in line && <p className="text-8xl font-bold">{line.answer ? t.show[line.answer] : "?"}</p>}
      {line.side && <p className={`text-4xl font-bold ${line.side === "good" ? "text-good" : "text-accent"}`}>{t.show.sides[line.side]}</p>}
      {line.text && <p className="max-w-2xl text-4xl font-semibold">{line.text}</p>}
    </div>
  );
}

/** A line of the card for the Storyteller: each part with its way to change or remove it, the missing parts to add. */
function LineEditor({ line, onChange, onRemove }: { line: ShowLine; onChange: (change: (line: ShowLine) => ShowLine) => void; onRemove?: () => void }) {
  const { state, locale, t } = useGrimoire();
  const [picking, setPicking] = useState<"roles" | "players" | null>(null);
  const without = <K extends keyof ShowLine>(key: K) => onChange((l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== key)) as ShowLine);
  const toggleRole = (id: string) => onChange((l) => ({ ...l, roles: l.roles.includes(id) ? l.roles.filter((x) => x !== id) : [...l.roles, id] }));
  const toggleSeat = (id: string) =>
    onChange((l) => ({ ...l, seatIds: l.seatIds.includes(id) ? l.seatIds.filter((x) => x !== id) : state.seats.filter((s) => s.id === id || l.seatIds.includes(s.id)).map((s) => s.id) }));
  const name = (id: string) => state.seats.find((s) => s.id === id)?.name || "?";
  const remove = <span className="text-muted">✕</span>;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3" data-testid="show-line-editor">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={line.title ?? ""}
          onChange={(e) => onChange((l) => ({ ...l, title: (e.target.value || null) as ShowTitle | null }))}
          aria-label={t.show.heading}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-base font-semibold"
        >
          <option value="">{t.show.noTitle}</option>
          {showTitles.map((title) => (
            <option key={title} value={title}>
              {t.show.titles[title]}
            </option>
          ))}
        </select>
        {onRemove && (
          <button type="button" onClick={onRemove} className="min-h-11 rounded-lg border border-border px-3 text-sm" aria-label={t.show.removeLine}>
            ✕
          </button>
        )}
      </div>

      {(line.seatIds.length > 0 || line.roles.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {line.seatIds.map((id) => (
            <button key={id} type="button" className={`${chip} border-border bg-card font-semibold`} onClick={() => toggleSeat(id)} aria-label={`${t.remove}: ${name(id)}`}>
              {name(id)} {remove}
            </button>
          ))}
          {line.roles.map((id) => (
            <button key={id} type="button" className={`${chip} border-border bg-card pl-1`} onClick={() => toggleRole(id)} aria-label={`${t.remove}: ${nameOf(id, locale)}`}>
              <RoleIcon roleId={id} size={28} />
              {nameOf(id, locale)} {remove}
            </button>
          ))}
        </div>
      )}

      {"number" in line && (
        <div className="flex items-center gap-2">
          <button type="button" className={`${chip} border-border`} onClick={() => onChange((l) => ({ ...l, number: Math.max(0, (l.number ?? 1) - 1) }))} aria-label={t.show.less}>
            −
          </button>
          <span className="w-12 text-center text-3xl font-bold tabular-nums" data-testid="show-number">
            {line.number ?? "?"}
          </span>
          <button type="button" className={`${chip} border-border`} onClick={() => onChange((l) => ({ ...l, number: (l.number ?? -1) + 1 }))} aria-label={t.show.more}>
            +
          </button>
          <button type="button" className={`${chip} ml-auto border-border`} onClick={() => without("number")} aria-label={`${t.remove}: ${t.show.number}`}>
            {remove}
          </button>
        </div>
      )}
      {"answer" in line && (
        <div className="flex items-center gap-2">
          {(["yes", "no"] as const).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={line.answer === a}
              onClick={() => onChange((l) => ({ ...l, answer: a }))}
              className={`${chip} px-5 font-semibold ${line.answer === a ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}
            >
              {t.show[a]}
            </button>
          ))}
          <button type="button" className={`${chip} ml-auto border-border`} onClick={() => without("answer")} aria-label={`${t.remove}: ${t.show.yes} / ${t.show.no}`}>
            {remove}
          </button>
        </div>
      )}
      {line.side && (
        <div className="flex items-center gap-2">
          {(["good", "evil"] as const).map((side) => (
            <button
              key={side}
              type="button"
              aria-pressed={line.side === side}
              onClick={() => onChange((l) => ({ ...l, side }))}
              className={`${chip} font-semibold ${line.side === side ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}
            >
              {t.show.sides[side]}
            </button>
          ))}
          <button type="button" className={`${chip} ml-auto border-border`} onClick={() => without("side")} aria-label={`${t.remove}: ${t.show.side}`}>
            {remove}
          </button>
        </div>
      )}
      {"text" in line && (
        <div className="flex items-center gap-2">
          <input
            value={line.text}
            onChange={(e) => onChange((l) => ({ ...l, text: e.target.value.slice(0, 120) }))}
            placeholder={t.show.textPlaceholder}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-base"
          />
          <button type="button" className={`${chip} border-border`} onClick={() => without("text")} aria-label={`${t.remove}: ${t.show.textPlaceholder}`}>
            {remove}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={add} aria-expanded={picking === "players"} onClick={() => setPicking(picking === "players" ? null : "players")}>
          {t.show.addPlayer}
        </button>
        <button type="button" className={add} aria-expanded={picking === "roles"} onClick={() => setPicking(picking === "roles" ? null : "roles")}>
          {t.show.addRole}
        </button>
        {!("number" in line) && (
          <button type="button" className={add} onClick={() => onChange((l) => ({ ...l, number: 0 }))}>
            {t.show.addNumber}
          </button>
        )}
        {!("answer" in line) && (
          <button type="button" className={add} onClick={() => onChange((l) => ({ ...l, answer: null }))}>
            {t.show.addAnswer}
          </button>
        )}
        {!line.side && (
          <button type="button" className={add} onClick={() => onChange((l) => ({ ...l, side: "good" }))}>
            {t.show.addSide}
          </button>
        )}
        {!("text" in line) && (
          <button type="button" className={add} onClick={() => onChange((l) => ({ ...l, text: "" }))}>
            {t.show.addText}
          </button>
        )}
      </div>
      {picking === "players" && (
        <div className="flex flex-wrap gap-1.5">
          {players(state).map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={line.seatIds.includes(s.id)}
              onClick={() => toggleSeat(s.id)}
              className={`${chip} ${line.seatIds.includes(s.id) ? "border-accent bg-accent/10 font-semibold" : "border-border bg-card"}`}
            >
              {s.name || "?"}
            </button>
          ))}
        </div>
      )}
      {picking === "roles" && (
        <RoleGrid roleIds={[...new Set([...state.script.roleIds, ...line.roles])]} marked={new Set(line.roles)} label={t.role} onPick={toggleRole} />
      )}
    </section>
  );
}
