"use client";

import { useState } from "react";
import { findRole, findStorytellerRole } from "@/modules/botc/lib/botc-roles";
import {
  becomeDemon,
  demonProtection,
  demonToMinion,
  diedLately,
  diedToday,
  distribution,
  evilDead,
  evilLivingNeighbours,
  evilPairs,
  impairment,
  LEARNS_TEAM,
  LIL_MONSTA,
  lleechHost,
  misregistration,
  nearestEvilWay,
  neighbours,
  noDashiiPoisoned,
  playerSeats,
  players,
  poCharged,
  putToken,
  registersAs,
  registersDead,
  remindersOf,
  seatSide,
  shownAs,
  survives,
  starPass,
  toggleReminder,
  tokenOf,
  townsfolkNeighbours,
  typhonInLine,
  usedToken,
  vortoxWorks,
  xaanNight,
  type GrimoireEvent,
  type GrimoireSeat,
  type GrimoireState,
  type InfoNumber,
  type NightStep,
  type SpecialStep,
} from "@/modules/botc/lib/grimoire/state";
import type { GrimoireCharacter } from "@/modules/botc/lib/grimoire/characters";
import { fill } from "@/modules/botc/lib/grimoire/text";
import { nameOf, RoleIcon, useGrimoire, type GrimoireTexts } from "./context";
import { ShowButton } from "./show";
import { stepCards } from "@/modules/botc/lib/grimoire/show";
import type { Locale } from "@/i18n/dictionaries";

const specialIcon: Record<SpecialStep, string> = { dusk: "🌙", minionInfo: "🗡️", demonInfo: "😈", dawn: "☀️" };

/** A reminder token being put on a player: the next tap in the town puts it there. */
export type Placing = { roleId: string; text: string };

/**
 * The night's steps in order. The first step not done is the current one: its text is open and the
 * seats that wake glow in the town. Tapping a step shows its text and seats without ticking it.
 * `preview`: the first night before the game, to prepare what the information characters are shown.
 */
export function NightPanel({
  steps,
  currentId,
  focusId,
  onFocus,
  onNext,
  preview = false,
  placing,
  onPlace,
}: {
  steps: NightStep[];
  currentId: string | null;
  focusId: string | null;
  onFocus: (stepId: string | null) => void;
  onNext: () => void;
  preview?: boolean;
  placing: Placing | null;
  onPlace: (placing: Placing | null) => void;
}) {
  const { state, update, readOnly, characters, locale, t } = useGrimoire();
  const first = preview || state.round === 1;
  const done = new Set(state.nightDone);
  const seats = new Map(state.seats.map((s) => [s.id, s]));
  const toggle = (id: string) =>
    update((s) => ({ ...s, nightDone: s.nightDone.includes(id) ? s.nightDone.filter((x) => x !== id) : [...s.nightDone, id] }));

  return (
    <div className="flex flex-col gap-2" data-testid="night-panel">
      <h3 className="text-lg font-bold">{preview ? t.nightPrep : first ? t.firstNight : fill(t.phases.night, { n: state.round })}</h3>
      {preview && <p className="text-sm text-muted">{t.nightPrepHint}</p>}
      <ol className="flex flex-col gap-1.5">
        {steps.map((step) => {
          const isDone = !preview && done.has(step.id);
          const isCurrent = step.id === currentId;
          const open = isCurrent || step.id === focusId;
          const name = step.special ? t.steps[step.special] : nameOf(step.roleId, locale);
          const text = step.special
            ? t.stepTexts[step.special]
            : step.roleId
              ? characters[step.roleId]?.[first ? "firstNightReminder" : "otherNightReminder"]
              : "";
          const woken = step.seatIds.flatMap((id) => (seats.has(id) ? [seats.get(id)!] : []));
          const allDead = woken.length > 0 && woken.every((s) => s.dead);
          return (
            <li
              key={step.id}
              className={`rounded-lg border ${isCurrent ? "border-amber-400 bg-amber-400/10" : step.id === focusId ? "border-accent/60" : "border-border"} ${isDone && !open ? "opacity-50" : ""}`}
              data-testid="night-step"
              data-step={step.id}
            >
              <div className="flex items-center gap-2 p-1.5">
                {!preview && (
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => toggle(step.id)}
                    aria-pressed={isDone}
                    aria-label={`${t.done}: ${name}`}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-base ${isDone ? "border-good bg-good text-white" : "border-border"}`}
                  >
                    {isDone && "✓"}
                  </button>
                )}
                <button type="button" onClick={() => onFocus(step.id === focusId ? null : step.id)} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left">
                  {step.roleId ? <RoleIcon roleId={step.roleId} size={32} /> : <span className="w-8 text-center text-xl">{specialIcon[step.special!]}</span>}
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className={`font-semibold ${isDone ? "line-through" : ""}`}>{name}</span>
                    {woken.length > 0 && (
                      <span className={`truncate text-xs ${allDead ? "text-muted" : ""}`}>
                        {woken
                          .map((s) => `${s.name}${s.role && step.roleId && s.role !== step.roleId ? ` (${nameOf(s.role, locale)})` : ""}${s.dead ? " ☠" : ""}`)
                          .join(", ")}
                      </span>
                    )}
                  </span>
                </button>
              </div>
              {open && text && <p className="px-3 pb-2 text-sm leading-snug whitespace-pre-line">{text.replace(/<\/?br\s*\/?>/gi, "\n")}</p>}
              {open && (step.special === "minionInfo" || step.special === "demonInfo") && <EvilInfoHelp />}
              {open && step.roleId && (
                <StepHelp roleId={step.roleId} woken={woken} placing={placing} onPlace={onPlace} canPlace={!readOnly} />
              )}
              {open && !readOnly && <StepShow step={step} />}
              {isCurrent && !readOnly && (
                <div className="px-1.5 pb-1.5">
                  <button type="button" onClick={() => toggle(step.id)} className="min-h-11 w-full rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground">
                    {t.done} ↓
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!preview && currentId === null && (
        <div className="flex flex-col gap-2 rounded-lg border border-good/40 bg-good/5 p-3">
          <p className="font-semibold">{t.nightComplete}</p>
          {!readOnly && (
            <button type="button" onClick={onNext} className="min-h-11 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground">
              {fill(t.toDay, { n: state.round })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Under a character's step: a warning when its player may get false information (or must, by the Vortox), what
 * to show worked out from the town (stepInfo) with notes on why it may be otherwise, the Imp's heir to pick, the
 * character's reminder tokens to put on a player and where they lie. A token of the character's own player
 * ("No ability", the Scarlet Woman's "Demon", the Po's "3 attacks") goes straight to them.
 */
function StepHelp({
  roleId,
  woken,
  placing,
  onPlace,
  canPlace,
}: {
  roleId: string;
  woken: GrimoireState["seats"];
  placing: Placing | null;
  onPlace: (placing: Placing | null) => void;
  canPlace: boolean;
}) {
  const { state, update, characters, locale, t } = useGrimoire();
  const c = characters[roleId];
  if (!c) return null;
  const used = usedToken(c, t.abilityUsed);
  const own = new Set([...c.selfTokens, ...(used ? [used] : [])]);
  // Lil' Monsta's tokens are all global: "Is the Demon" for its babysitter, its "Dead"
  const tokens = [...new Set([...(roleId === LIL_MONSTA ? c.remindersGlobal : c.reminders), ...own])];
  // the player the character's own tokens go to: only when one player wakes for it
  const self = woken.length === 1 ? woken[0] : null;
  const placed = remindersOf(state, roleId);
  const { info, notes } = stepInfo(state, roleId, woken, characters, locale, t);
  const pass = roleId === "imp" && state.phase === "night" ? starPass(state, characters) : null;
  const imp = nameOf("imp", locale);
  if (pass && !pass.heir && !pass.choices.length) info.push(t.noHeir);
  // a Fabled's or Loric's step is the Storyteller's: a drunk player woken for it (the Storm Catcher's evil) learns the truth
  const warnings = findStorytellerRole(roleId)
    ? []
    : woken.flatMap((s) => {
        const why = impairment(state, s, characters);
        return why ? [fill(t.impaired[why], { name: s.name || "?" })] : [];
      });
  if (falseInfo(state, woken, characters)) warnings.push(t.vortox);
  if (!info.length && !notes.length && !warnings.length && !tokens.length) return null;
  return (
    <div className="flex flex-col gap-1.5 px-3 pb-2 text-sm" data-testid="step-help">
      {warnings.map((w) => (
        <p key={w} className="font-medium text-accent">
          ⚠️ {w}
        </p>
      ))}
      {notes.map((note) => (
        <p key={note} className="text-muted" data-testid="step-note">
          ℹ️ {note}
        </p>
      ))}
      {info.map((line) => (
        <p key={line} className="rounded-md bg-amber-400/15 px-2 py-1 font-semibold" data-testid="step-info">
          👉 {line}
        </p>
      ))}
      {pass && !pass.heir && pass.choices.length > 0 && canPlace && (
        <div className="flex flex-col gap-1.5 rounded-md bg-amber-400/15 px-2 py-1.5" data-testid="imp-heirs">
          <p className="font-semibold">👉 {fill(t.pickHeir, { role: imp })}</p>
          <div className="flex flex-wrap gap-1.5">
            {pass.choices.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => update((x) => becomeDemon(x, s.id, "imp", characters))}
                className="flex min-h-10 items-center gap-1.5 rounded-full border border-accent bg-card px-2.5 text-sm font-medium hover:bg-accent/10"
              >
                {s.role && <RoleIcon roleId={s.role} size={20} />}
                {s.name || "?"}
              </button>
            ))}
          </div>
        </div>
      )}
      {placed.length > 0 && (
        <p className="text-xs text-muted">
          {placed.map(({ seat, reminder }) => `${reminder.text}: ${seat.name || "?"}`).join(" · ")}
        </p>
      )}
      {roleId === "ojo" && state.phase === "night" && canPlace && <OjoChoice />}
      {canPlace && tokens.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tokens.map((text) => {
            if (self && own.has(text)) {
              const on = self.reminders.some((r) => r.roleId === roleId && r.text === text);
              return (
                <button
                  key={text}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update((s) => toggleReminder(s, self.id, roleId, text))}
                  className={`flex min-h-10 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${on ? "border-border bg-border/40 text-muted" : "border-accent bg-card text-accent hover:bg-accent/10"}`}
                >
                  <RoleIcon roleId={roleId} size={20} />
                  {on ? `✓ ${text}` : text}
                </button>
              );
            }
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
    </div>
  );
}

/** "Show the player" for a step: one button, or one for each player when each learns their own (two Empaths). */
function StepShow({ step }: { step: NightStep }) {
  const { state, characters, t } = useGrimoire();
  const cards = stepCards(state, step, characters);
  if (!cards.length) return null;
  const name = (seatIds: string[]) => state.seats.find((s) => s.id === seatIds[0])?.name || "?";
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pb-2">
      {cards.map(({ seatIds, card }) => (
        <ShowButton key={seatIds.join()} card={card} label={cards.length > 1 ? fill(t.show.buttonFor, { name: name(seatIds) }) : undefined} />
      ))}
    </div>
  );
}

/** More characters than this the Washerwoman… may be shown: the team is named instead. */
const MAX_LISTED = 15;

/** A Townsfolk wakes while the Vortox works: their information must be false. */
function falseInfo(state: GrimoireState, woken: GrimoireSeat[], characters: Record<string, GrimoireCharacter>) {
  return woken.some((s) => findRole(s.role)?.team === "townsfolk") && vortoxWorks(state, characters);
}

/**
 * What to show the character's player and what else the step needs, worked out from the town (`info`), and why
 * it may be otherwise (`notes`): every number or character it may be as a Spy or Recluse registers one way or
 * the other each time, what the Vortox's false information must not be, who the Demon's attack did not kill and
 * who became the Demon, what the Zombuul, Godfather, Shabaloth, Po, No Dashii and Vigormortis do tonight.
 */
function stepInfo(
  state: GrimoireState,
  roleId: string,
  woken: GrimoireSeat[],
  characters: Record<string, GrimoireCharacter>,
  locale: Locale,
  t: GrimoireTexts,
): { info: string[]; notes: string[] } {
  const c = characters[roleId];
  const info: string[] = [];
  const notes: string[] = [];
  const nameAt = (seatId: string) => state.seats.find((s) => s.id === seatId)?.name || "?";
  const or = (items: string[]) => (items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${t.or} ${items.at(-1)}`);
  const misregistering = (seats: GrimoireSeat[]) =>
    seats.forEach((s) => {
      const m = misregistration(state, s, characters);
      if (m) notes.push(fill(t.misregisters[m.roleId as keyof GrimoireTexts["misregisters"]], { name: s.name || "?", role: nameOf(m.roleId, locale) }));
    });
  const vortox = falseInfo(state, woken, characters);
  const night = state.phase === "night";
  const result = () => ({ info, notes: [...new Set(notes)] });
  // the Fortune Teller's "yes": a Demon, the red herring, or a Recluse who registers as a Demon
  const fortuneTeller = () => {
    const herring = remindersOf(state, roleId)[0]?.seat;
    const yes = players(state).filter((s) => findRole(s.role)?.team === "demon" || s.id === herring?.id);
    misregistering(players(state).filter((s) => misregistration(state, s, characters)?.teams.includes("demon")));
    return [
      ...(herring ? [] : [fill(t.redHerring, { token: c.reminders[0] ?? "" })]),
      fill(vortox ? t.fortuneTellerFalse : t.fortuneTeller, { names: or(yes.map((s) => s.name || "?")) }),
    ];
  };

  // Washerwoman, Librarian, Investigator: the character of the player under the first token, and both players
  if (Object.values(c.tokenKinds).includes("wrong")) {
    const placed = remindersOf(state, roleId);
    const right = placed.find(({ reminder }) => c.tokenKinds[reminder.text] !== "wrong");
    const wrong = placed.find(({ reminder }) => c.tokenKinds[reminder.text] === "wrong");
    if (!right || !wrong) return { info: [t.infoPlaceTokens], notes };
    const two = { a: right.seat.name || "?", b: wrong.seat.name || "?" };
    if (vortox) info.push(fill(t.infoShowFalse, two));
    else {
      const team = LEARNS_TEAM[roleId];
      const roles = team ? registersAs(state, right.seat, team, characters) : [];
      if (roles.length < 2) info.push(fill(t.infoShow, { role: nameOf(roles[0] ?? right.seat.role, locale), ...two }));
      else {
        misregistering([right.seat]);
        if (roles.length > MAX_LISTED) info.push(fill(t.infoShowTeam, { team: t.teams[team], ...two }));
        else info.push(fill(t.infoShowAny, { roles: or(roles.map((id) => nameOf(id, locale))), ...two }));
      }
    }
    return result();
  }

  const number = (x: InfoNumber) => {
    const list = or(x.values.map(String));
    if (vortox) return fill(t.infoNumberFalse, { list });
    if (x.values.length < 2) return fill(t.infoNumber, { n: x.n });
    misregistering(x.by);
    return fill(t.infoNumbers, { list, n: x.n });
  };
  if (roleId === "chef") info.push(number(evilPairs(state, characters)));
  if (roleId === "empath") woken.forEach((s) => info.push((woken.length > 1 ? `${s.name}: ` : "") + number(evilLivingNeighbours(state, s.id, characters))));
  if (roleId === "clockmaker") info.push(number(demonToMinion(state, characters)));
  if (roleId === "oracle" && night) info.push(number(evilDead(state, characters)));
  if (roleId === "shugenja") {
    woken.forEach((s) => {
      const way = nearestEvilWay(state, s.id, characters);
      misregistering(way.by);
      if (vortox) info.push(fill(t.shugenjaFalse, { way: t.ways[way.n] }));
      else info.push(fill(t.shugenja, { way: or(way.values.map((v) => t.ways[v])) }));
    });
  }
  if (roleId === "undertaker" && night) {
    const executed = diedToday(state);
    if (!executed.length) info.push(t.undertakerNone);
    executed.forEach((e) => {
      const seat = state.seats.find((x) => x.id === e.seatId);
      const roles = seat ? shownAs(state, { ...seat, role: e.role }, characters).map((id) => nameOf(id, locale)) : [nameOf(e.role, locale)];
      if (seat && roles.length > 1) misregistering([seat]);
      info.push(fill(vortox ? t.undertakerFalse : t.undertaker, { name: e.name || "?", roles: or(roles) }));
    });
  }
  if (roleId === "fortuneteller") info.push(...fortuneTeller());
  if (roleId === "king" && night && state.round > 1) {
    const dead = players(state).filter((s) => s.dead).length;
    info.push(dead >= players(state).length - dead ? t.kingLearns : t.kingNothing);
  }

  // a Zombuul who only registers as dead still wakes
  woken.filter((s) => registersDead(state, s)).forEach((s) => notes.push(fill(t.registersDead, { name: s.name || "?" })));
  const log = state.log ?? [];
  const names = (events: GrimoireEvent[]) => events.map((e) => e.name || "?").join(", ");
  // who became the Demon by day (the Scarlet Woman) learns it at her step
  log
    .filter((e) => night && e.kind === "became" && e.day && e.round === state.round - 1 && e.role === roleId && e.by)
    .forEach((e) => info.push(fill(t.newDemon, { role: nameOf(e.by!, locale), name: e.name || "?" })));

  if (roleId === "godfather" && night && state.round > 1) {
    const outsiders = diedToday(state).filter((e) => findRole(e.role)?.team === "outsider");
    info.push(outsiders.length ? fill(t.godfatherKills, { names: names(outsiders) }) : t.godfatherRests);
  }
  // the first night: the Kazali makes the Minions, the Lord of Typhon's neighbours learn they are Minions
  const first = state.phase === "setup" || state.round === 1;
  if (roleId === "kazali" && first) info.push(fill(t.kazaliMinions, { n: distribution(playerSeats(state).length)?.minion ?? 1 }));
  if (roleId === "lordoftyphon" && first) {
    woken.forEach((s) => {
      const two = neighbours(state, s.id).map((id) => state.seats.find((x) => x.id === id)!);
      info.push(fill(t.typhonNeighbours, { list: two.map((x) => `${x.name || "?"} (${nameOf(x.role, locale)})`).join(", ") }));
    });
    if (typhonInLine(state) === false) notes.push(t.typhonApart);
  }
  if (roleId === "lleech") {
    const host = lleechHost(state, characters);
    if (host) info.push(fill(t.lleechHost, { name: host.name || "?" }));
  }
  if (roleId === LIL_MONSTA) {
    const babysitter = state.seats.find((s) => s.reminders.some((r) => r.roleId === LIL_MONSTA && c.tokenKinds[r.text] === "babysitter"));
    info.push(babysitter ? fill(t.babysitter, { name: babysitter.name || "?" }) : fill(t.babysitterPick, { token: tokenOf(c, "babysitter") ?? "" }));
  }
  if (roleId === "leviathan" && (night || first)) info.push(fill(t.leviathanNight, { n: Math.max(1, state.round) }));
  if (roleId === "riot" && night) {
    const minions = players(state).filter((s) => findRole(s.role)?.team === "minion");
    if (state.round === 3 && minions.length) info.push(fill(t.riotSoon, { names: minions.map((s) => s.name || "?").join(", ") }));
    else if (state.round < 3) info.push(t.riotLater);
  }
  // the Minions: the Witch's last 3, the Summoner's 3rd night, the Pit-Hag's and Kazali's new characters, the Xaan's night
  if (roleId === "witch" && players(state).filter((s) => !s.dead).length <= 3) info.push(t.witchNoAbility);
  if (roleId === "summoner" && night) info.push(state.round >= 3 ? t.summonerNow : fill(t.summonerWait, { n: state.round }));
  if (roleId === "pithag" && night) info.push(t.pitHag);
  if (roleId === "xaan") {
    const x = xaanNight(state, characters);
    if (x) info.push(fill(t.xaan, { n: x }));
  }
  if (roleId === "mezepheles" && night) info.push(fill(t.mezepheles, { token: tokenOf(c, "turnsEvil") ?? "" }));
  if (roleId === "boffin" && first) {
    const gives = woken.find((s) => s.believedRole)?.believedRole;
    info.push(gives ? fill(t.boffinGives, { role: nameOf(gives, locale) }) : t.boffinPick);
  }
  // the Outsiders: the Lunatic's pretend Demon, the Goon's chooser, who died lately, the Ogre's friend
  if (roleId === "lunatic") {
    const lunatic = woken.find((s) => s.role === "lunatic");
    if (lunatic?.believedRole) info.push(fill(t.lunaticActs, { role: nameOf(lunatic.believedRole, locale), token: c.reminders[0] ?? "" }));
    const chosen = remindersOf(state, roleId).filter(({ reminder }) => night && reminder.round === state.round);
    if (lunatic && chosen.length) info.push(fill(t.lunaticChose, { name: lunatic.name || "?", names: chosen.map(({ seat }) => seat.name || "?").join(", ") }));
  }
  woken
    .filter((s) => night && s.reminders.some((r) => r.roleId === "goon" && r.round === state.round))
    .forEach((s) => info.push(fill(t.goonChose, { name: s.name || "?", side: t.sideOf[seatSide(s, characters, state) === "evil" ? "evil" : "good"] })));
  const lately = night ? diedLately(state) : [];
  const diedNow = (role: string) => lately.some((e) => e.role === role);
  if (roleId === "barber" && diedNow("barber")) info.push(t.barberDied);
  const diedTonight = (role: string) => lately.filter((e) => e.role === role && !e.day && e.round === state.round);
  const byDemon = (e: GrimoireEvent) => findRole(e.by)?.team === "demon";
  const demonNames = () => or(players(state).filter((s) => findRole(s.role)?.team === "demon").map((s) => s.name || "?"));
  if (roleId === "ravenkeeper" && diedTonight("ravenkeeper").length) info.push(t.ravenkeeper);
  if (roleId === "farmer" && diedTonight("farmer").length) info.push(t.farmer);
  if (roleId === "sage" && diedTonight("sage").some(byDemon)) info.push(fill(t.sage, { names: demonNames() }));
  if (roleId === "choirboy" && diedTonight("king").some(byDemon)) info.push(fill(t.choirboy, { names: demonNames() }));
  if (roleId === "hatter" && diedNow("hatter")) info.push(t.hatterDied);
  if (roleId === "moonchild" && diedNow("moonchild")) info.push(fill(t.moonchildKill, { token: tokenOf(c, "dead") ?? "" }));
  if (roleId === "sweetheart" && night && woken.some((s) => s.dead) && !remindersOf(state, roleId).length) {
    info.push(fill(t.sweetheartDrunk, { token: tokenOf(c, "drunk") ?? "" }));
  }
  if (roleId === "ogre") {
    const friend = remindersOf(state, roleId).find(({ seat }) => seat.role !== "ogre")?.seat;
    if (friend) info.push(fill(t.ogreFriend, { name: friend.name || "?", side: t.sideOf[seatSide(friend, characters) === "evil" ? "evil" : "good"] }));
  }
  if (roleId === "alhadikhia" && night) info.push(fill(t.alHadikhia, { death: tokenOf(c, "choseDeath") ?? "", life: tokenOf(c, "choseLife") ?? "" }));
  if (findRole(roleId)?.team !== "demon" || !night) return result();

  // the Demon's attacks tonight that did not kill: who or what kept the player alive
  for (const { seat, reminder } of remindersOf(state, roleId)) {
    if (seat.dead || reminder.round !== state.round || c.tokenKinds[reminder.text] !== "dead") continue;
    const by = seat.reminders.some((r) => r.roleId === "fool" && r.round === state.round) ? "fool" : (demonProtection(state, seat.id, characters) ?? survives(state, seat, characters));
    if (by) info.push(fill(t.survives, { name: seat.name || "?", role: nameOf(by, locale) }));
  }
  // the Mayor attacked tonight may have someone else die instead
  if (remindersOf(state, roleId).some(({ seat, reminder }) => seat.role === "mayor" && reminder.round === state.round && c.tokenKinds[reminder.text] === "dead")) {
    info.push(t.mayorBounce);
  }
  if (woken.some((s) => s.reminders.some((r) => r.roleId === "exorcist" && r.round === state.round))) info.push(t.exorcised);
  if (remindersOf(state, "princess").some(({ reminder }) => reminder.round === state.round - 1)) info.push(t.princess);
  if (lately.some((e) => e.by === "lycanthrope" && !e.day && e.round === state.round)) info.push(t.lycanthropeNoKill);
  // who became this Demon tonight: the Imp's heir, the Fang Gu's Outsider
  log
    .filter((e) => e.kind === "became" && !e.day && e.round === state.round && e.by === roleId)
    .forEach((e) => info.push(fill(t.newDemon, { role: nameOf(roleId, locale), name: `${e.name || "?"} (${nameOf(e.role, locale)})` })));

  if (roleId === "zombuul") {
    const today = diedToday(state);
    info.push(today.length ? fill(t.zombuulRests, { names: names(today) }) : t.zombuulKills);
  }
  if (roleId === "shabaloth") {
    const chosen = log.filter((e) => e.kind === "death" && e.by === roleId && !e.day && e.round === state.round - 1 && state.seats.find((s) => s.id === e.seatId)?.dead);
    if (chosen.length) info.push(fill(t.regurgitate, { names: names(chosen), token: tokenOf(c, "alive") ?? "" }));
  }
  if (roleId === "po") info.push(poCharged(state, characters) ? t.poThree : fill(t.poNobody, { token: tokenOf(c, "charged") ?? "" }));
  if (roleId === "nodashii") {
    const poisoned = noDashiiPoisoned(state, characters);
    if (poisoned.length) info.push(fill(t.noDashii, { names: poisoned.map(nameAt).join(", ") }));
  }
  if (roleId === "vigormortis") {
    // a Minion killed tonight with two Townsfolk neighbours, neither poisoned yet: the Storyteller picks one
    const poison = tokenOf(c, "poisoned");
    for (const { seat, reminder } of remindersOf(state, roleId)) {
      if (c.tokenKinds[reminder.text] !== "hasAbility" || reminder.round !== state.round) continue;
      const townsfolk = townsfolkNeighbours(state, seat.id);
      const done = townsfolk.some((id) => state.seats.find((s) => s.id === id)?.reminders.some((r) => r.roleId === roleId && r.text === poison));
      if (townsfolk.length === 2 && !done) info.push(fill(t.vigormortisPick, { name: seat.name || "?", a: nameAt(townsfolk[0]), b: nameAt(townsfolk[1]) }));
    }
  }
  return result();
}

/**
 * Under the Minion and Demon info of the first night: the Magician shown the other way round, the Poppy Grower
 * keeping them apart.
 */
function EvilInfoHelp() {
  const { state, characters, t } = useGrimoire();
  const magician = players(state).find((s) => s.role === "magician" && !impairment(state, s, characters));
  const poppy = players(state).some((s) => s.role === "poppygrower" && !s.dead && !impairment(state, s, characters));
  const lines = [...(poppy ? [t.poppyGrower] : []), ...(magician ? [fill(t.magician, { name: magician.name || "?" })] : [])];
  if (!lines.length) return null;
  return (
    <div className="flex flex-col gap-1.5 px-3 pb-2 text-sm">
      {lines.map((line) => (
        <p key={line} className="rounded-md bg-amber-400/15 px-2 py-1 font-semibold" data-testid="step-info">
          👉 {line}
        </p>
      ))}
    </div>
  );
}

/**
 * The Ojo's character for tonight: the players who are it die by its attack (the Demon's "Dead"); when nobody is,
 * the Storyteller picks who dies with the token.
 */
function OjoChoice() {
  const { state, update, characters, locale, t } = useGrimoire();
  const [picked, setPicked] = useState("");
  const dead = tokenOf(characters.ojo, "dead") ?? "";
  const roleIds = state.script.roleIds.filter((id) => findRole(id)?.team !== "traveller");
  const pick = (roleId: string) => {
    setPicked(roleId);
    const chosen = players(state).filter((s) => s.role === roleId && !s.dead);
    if (chosen.length && dead) update((x) => chosen.reduce((y, s) => putToken(y, s.id, "ojo", dead, characters), x));
  };
  const inPlay = picked && players(state).some((s) => s.role === picked);
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-wrap items-center gap-2 font-semibold">
        {t.ojoPick}
        <select value={picked} onChange={(e) => pick(e.target.value)} className="min-h-10 rounded-lg border border-border bg-card px-2 font-normal" data-testid="ojo-pick">
          <option value="">–</option>
          {roleIds.map((id) => (
            <option key={id} value={id}>
              {nameOf(id, locale)}
            </option>
          ))}
        </select>
      </label>
      {picked && !inPlay && <p className="rounded-md bg-amber-400/15 px-2 py-1 font-semibold">👉 {fill(t.ojoNone, { role: nameOf(picked, locale), token: dead })}</p>}
    </div>
  );
}
