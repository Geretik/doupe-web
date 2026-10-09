"use client";

import { useState } from "react";
import { findStorytellerRole, roleTeams, storytellerRoles, type RoleTeam, type StorytellerTeam } from "@/modules/botc/lib/botc-roles";
import { jinxesAmong } from "@/modules/botc/lib/grimoire/characters";
import { remindersOf, returnVotes, type GrimoireState } from "@/modules/botc/lib/grimoire/state";
import { nameOf, RoleIcon, useGrimoire } from "./context";
import type { Placing } from "./night-panel";

/** The Fabled gold, the Loric green: as on the official tokens */
const teamBorder: Record<StorytellerTeam, string> = { fabled: "border-amber-500", loric: "border-emerald-600" };
const teamBox: Record<StorytellerTeam, string> = { fabled: "border-amber-500/40 bg-amber-500/5", loric: "border-emerald-600/40 bg-emerald-600/5" };
const teamOf = (id: string) => findStorytellerRole(id)?.team ?? "fabled";

const big = "min-h-11 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-40";
const plain = `${big} border-border bg-card hover:border-accent/50`;
const heading = "text-xs font-semibold tracking-wide text-muted uppercase";

/** The game without the Fabled or Loric, and without its tokens at the players. */
function withoutFabled(s: GrimoireState, id: string): GrimoireState {
  return {
    ...s,
    fabled: (s.fabled ?? []).filter((x) => x !== id),
    seats: s.seats.map((seat) => (seat.reminders.some((r) => r.roleId === id) ? { ...seat, reminders: seat.reminders.filter((r) => r.roleId !== id) } : seat)),
  };
}

/**
 * The Fabled and Loric in the game, in a corner of the town as on the official grimoire: a tap opens one in the
 * panel. Smaller on a phone, and in more columns rather than down the side where the players sit.
 */
export function FabledTokens({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const { state, scale, locale } = useGrimoire();
  const fabled = state.fabled ?? [];
  if (!fabled.length) return null;
  return (
    // as big as the town's tokens on this device
    <div className="absolute top-0 right-0 z-10 flex max-h-[45%] flex-col flex-wrap-reverse gap-1.5" style={{ zoom: scale }} data-testid="fabled-tokens">
      {fabled.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          aria-pressed={id === selectedId}
          aria-label={nameOf(id, locale)}
          title={nameOf(id, locale)}
          className={`flex size-10 items-center justify-center rounded-full border-[3px] bg-card shadow-md sm:size-12 ${teamBorder[teamOf(id)]} ${id === selectedId ? "outline-4 outline-offset-2 outline-accent" : ""}`}
        >
          <RoleIcon roleId={id} size={36} className="max-h-[75%] max-w-[75%]" />
        </button>
      ))}
    </div>
  );
}

/**
 * A Fabled or Loric tapped in the town: its ability, the Djinn's jinxes, the Bootlegger's homebrew of the script,
 * the Ferryman's votes back, its tokens to put on a player (the next tap in the town) and where they lie, taking it
 * out of the game.
 */
export function FabledPanel({
  roleId,
  placing,
  onPlace,
  onClose,
}: {
  roleId: string;
  placing: Placing | null;
  onPlace: (placing: Placing | null) => void;
  onClose: () => void;
}) {
  const { state, update, readOnly, hidden, characters, locale, t } = useGrimoire();
  const c = characters[roleId];
  const team = teamOf(roleId);
  const placed = remindersOf(state, roleId);
  const tokens = [...new Set(c?.reminders ?? [])];
  const jinxes = roleId === "djinn" ? jinxesAmong(state.script.roleIds, characters) : [];
  return (
    <div className="flex flex-col gap-4" data-testid="fabled-panel">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className={`flex size-14 shrink-0 items-center justify-center rounded-full border-[3px] bg-card ${teamBorder[team]}`}>
            <RoleIcon roleId={roleId} size={42} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-xl font-bold">{nameOf(roleId, locale)}</span>
            <span className={heading}>{t.storytellerTeams[team]}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          title={t.close}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-lg hover:border-accent/50"
        >
          ✕
        </button>
      </div>
      {c && <p className="text-sm leading-snug">{c.ability}</p>}

      {roleId === "djinn" && (
        <section className="flex flex-col gap-1.5" data-testid="djinn-jinxes">
          <h3 className={heading}>{t.djinnJinxes}</h3>
          {jinxes.length === 0 && <p className="text-sm text-muted">{t.djinnNoJinxes}</p>}
          <ul className="flex flex-col gap-1.5 text-sm">
            {jinxes.map(({ a, b, reason }) => (
              <li key={`${a}-${b}`} className="flex flex-wrap items-center gap-1.5">
                <RoleIcon roleId={a} size={22} />
                <RoleIcon roleId={b} size={22} />
                <span>
                  <span className="font-semibold">
                    {nameOf(a, locale)} + {nameOf(b, locale)}:
                  </span>{" "}
                  <span lang="en">{reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {roleId === "bootlegger" && <Homebrew />}

      {roleId === "ferryman" && !readOnly && (
        <button type="button" className={plain} onClick={() => update(returnVotes)} disabled={!state.seats.some((s) => s.dead && s.voteUsed)}>
          🗳 {t.ferrymanReturn}
        </button>
      )}

      {/* hidden: where its tokens lie is the Storyteller's */}
      {tokens.length > 0 && !hidden && (
        <section className="flex flex-col gap-2">
          <h3 className={heading}>{t.fabledTokens}</h3>
          {placed.length > 0 && <p className="text-xs text-muted">{placed.map(({ seat, reminder }) => `${reminder.text}: ${seat.name || "?"}`).join(" · ")}</p>}
          {!readOnly && (
            <div className="flex flex-wrap gap-1.5">
              {tokens.map((text) => {
                const active = placing?.roleId === roleId && placing.text === text;
                return (
                  <button
                    key={text}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onPlace(active ? null : { roleId, text })}
                    className={`flex min-h-10 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card hover:border-accent/50"}`}
                  >
                    <RoleIcon roleId={roleId} size={20} />
                    {text} →
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {!readOnly && (
        <button
          type="button"
          className={`${big} self-start border-accent text-accent hover:bg-accent/10`}
          onClick={() => {
            update((s) => withoutFabled(s, roleId));
            onClose();
          }}
        >
          {t.fabledRemove}
        </button>
      )}
    </div>
  );
}

/** The Bootlegger's: the script's own rules and characters, only to read – no player gets a homebrew character here. */
function Homebrew() {
  const { state, t } = useGrimoire();
  const { rules = [], characters = [] } = state.script.homebrew ?? {};
  const teamName = (team: string | null) =>
    roleTeams.includes(team as RoleTeam) ? t.teams[team as RoleTeam] : team === "fabled" || team === "loric" ? t.storytellerTeams[team] : null;
  if (!rules.length && !characters.length) return <p className="text-sm text-muted">{t.homebrewNone}</p>;
  return (
    <div className="flex flex-col gap-3" data-testid="homebrew">
      {rules.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className={heading}>{t.homebrewRules}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {rules.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ul>
        </section>
      )}
      {characters.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className={heading}>{t.homebrewCharacters}</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {characters.map((c, i) => (
              <li key={i}>
                <span className="font-semibold">{c.name}</span>
                {teamName(c.team) && <span className="text-xs text-muted"> · {teamName(c.team)}</span>}
                <p className="leading-snug">{c.ability}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t.homebrewHint}</p>
        </section>
      )}
    </div>
  );
}

/** In the setup: the Fabled and Loric in the game (the script's come by themselves), more to add, any to take out. */
export function FabledSetup({ wide = false }: { wide?: boolean }) {
  const { state, update, readOnly, characters, locale, t } = useGrimoire();
  const [open, setOpen] = useState(false);
  const fabled = state.fabled ?? [];
  const fromScript = new Set(state.script.fabled ?? []);
  const toggle = (id: string) => update((s) => (s.fabled?.includes(id) ? withoutFabled(s, id) : { ...s, fabled: [...(s.fabled ?? []), id] }));
  const collator = new Intl.Collator(locale);
  const groups = (["fabled", "loric"] as const).map((team) => ({
    team,
    ids: storytellerRoles
      .filter((r) => r.team === team)
      .map((r) => r.id)
      .sort((a, b) => collator.compare(nameOf(a, locale), nameOf(b, locale))),
  }));
  return (
    <section className="flex flex-col gap-2" data-testid="fabled-setup">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className={heading}>{t.fabledTitle}</h3>
        {!readOnly && (
          <button type="button" className={`${plain} ml-auto`} onClick={() => setOpen(!open)} aria-expanded={open}>
            {t.fabledAdd}
          </button>
        )}
      </div>
      <p className="text-xs text-muted">{t.fabledHint}</p>
      {fabled.length === 0 ? (
        <p className="text-sm text-muted">{t.fabledNone}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {fabled.map((id) => (
            <li key={id}>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => toggle(id)}
                aria-label={`${t.fabledRemove}: ${nameOf(id, locale)}`}
                className={`flex min-h-10 items-center gap-1.5 rounded-full border-2 bg-card py-0.5 pr-3 pl-1 text-sm ${teamBorder[teamOf(id)]}`}
              >
                <RoleIcon roleId={id} size={28} />
                {nameOf(id, locale)}
                {fromScript.has(id) && <span className="text-xs text-muted">({t.fabledFromScript})</span>}
                {!readOnly && <span className="text-muted">✕</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="flex flex-col gap-2">
          {groups.map((g) => (
            <div key={g.team} className={`rounded-xl border p-2 ${teamBox[g.team]}`}>
              <h4 className="mb-1.5 px-1 text-xs font-semibold tracking-wide uppercase">{t.storytellerTeams[g.team]}</h4>
              <div className={`grid gap-1.5 ${wide ? "grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]" : "grid-cols-2"}`}>
                {g.ids.map((id) => {
                  const on = fabled.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggle(id)}
                      aria-pressed={on}
                      aria-label={`${t.fabledAddLabel}: ${nameOf(id, locale)}`}
                      title={characters[id]?.ability}
                      className={`flex min-h-12 items-center gap-2 rounded-lg border px-1.5 py-1 text-left text-sm ${on ? "border-accent bg-accent/10 font-semibold" : "border-border bg-card hover:border-accent/50"}`}
                    >
                      <RoleIcon roleId={id} size={34} />
                      <span className="truncate">{nameOf(id, locale)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
