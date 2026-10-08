"use client";

import { useActionState, useMemo, useRef, useState, type ReactNode } from "react";
import { addGameAction, updateGameAction } from "@/modules/botc/actions/sessions";
import type { Game, ScriptLink } from "@/db/schema";
import type { Locale } from "@/i18n/dictionaries";
import {
  BLUFF_COUNT,
  bluffTeams,
  botcRoles,
  editionOfScript,
  findRole,
  linkedRoleOf,
  roleIcon,
  roleName,
  roleTeams,
  SAT_OUT,
  STORYTELLER,
  type BotcRole,
  type LinkedKind,
  type RoleEdition,
  type RoleTeam,
} from "@/modules/botc/lib/botc-roles";
import type { FormState } from "@/lib/validation";
import { keepValues } from "@/components/keep-values";
import { Alert, Button, Field, inputClass } from "@/components/ui";

export type GameFormLabels = {
  gameScript: string;
  gameScriptCustom: string;
  gameWinner: string;
  gameWinnerUnknown: string;
  gameWinnerGood: string;
  gameWinnerEvil: string;
  gamePlayers: string;
  gameNotes: string;
  gameAdd: string;
  gameAdding: string;
  gameSave: string;
  gameSaving: string;
  gameCancel: string;
  rosterTitle: string;
  rosterHint: string;
  rosterNobody: string;
  roleUnknown: string;
  roleSatOut: string;
  linkedLabel: Record<LinkedKind, string>;
  linkedHint: Record<LinkedKind, string>;
  bluffsTitle: string;
  bluffsHint: string;
  roleStoryteller: string;
  roleOther: string;
  roleTeams: Record<RoleTeam, string>;
};

/** A player who can be given a character: the session's signed-up players and anyone already entered in a game. */
export type RosterPlayer = { id: number; nickname: string };

/** The game's own fields and who played what in it (role null = sat it out). */
type EditedGame = Pick<Game, "id" | "scriptName" | "scriptUrl" | "winner" | "players" | "notes" | "demonBluffs"> & {
  roster: RosterEntered[];
};

type RosterEntered = { registrationId: number; role: string | null; believedRole: string | null };

/**
 * Records one played game, or edits `game` when given; the script can be picked from the session's list or typed.
 * A new game empties the form after saving; an edited one calls `onDone`.
 */
export function GameForm({
  sessionId,
  scripts: sessionScripts,
  roster,
  locale,
  game,
  onDone,
  t,
}: {
  sessionId: number;
  scripts: ScriptLink[];
  roster: RosterPlayer[];
  locale: Locale;
  game?: EditedGame;
  onDone?: () => void;
  t: GameFormLabels;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  // a new key empties the character selects too after a new game was added
  const [added, setAdded] = useState(0);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = game ? await updateGameAction(game.id, prev, formData) : await addGameAction(sessionId, prev, formData);
    if (result.ok) {
      if (onDone) onDone();
      else {
        formRef.current?.reset();
        setAdded((n) => n + 1);
      }
    }
    return result;
  }, {});
  // the edited game's script stays on offer (with its link) even when the session's list no longer has it
  const scripts =
    game && !sessionScripts.some((s) => s.name === game.scriptName)
      ? [{ name: game.scriptName, url: game.scriptUrl ?? "" }, ...sessionScripts]
      : sessionScripts;
  const [pick, setPick] = useState(game?.scriptName ?? scripts[0]?.name ?? "__custom");
  const fe = state.fieldErrors ?? {};
  const chosen = scripts.find((s) => s.name === pick);
  // several forms on one page (the new game and the ones being edited) need their own ids
  const id = (name: string) => (game ? `game${game.id}-${name}` : name);
  return (
    <form ref={formRef} action={action} onSubmit={keepValues(action)} className="flex flex-col gap-3">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Field label={t.gameScript} name={id("scriptPick")} errors={fe.scriptName}>
          <select id={id("scriptPick")} value={pick} onChange={(e) => setPick(e.target.value)} className={inputClass}>
            {scripts.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
            <option value="__custom">{t.gameScriptCustom}</option>
          </select>
          {pick === "__custom" ? (
            <input name="scriptName" required maxLength={200} className={`${inputClass} mt-2`} placeholder="Trouble Brewing" />
          ) : (
            <>
              <input type="hidden" name="scriptName" value={chosen?.name ?? ""} />
              <input type="hidden" name="scriptUrl" value={chosen?.url ?? ""} />
            </>
          )}
        </Field>
        <Field label={t.gameWinner} name={id("winner")} errors={fe.winner}>
          <select id={id("winner")} name="winner" defaultValue={game?.winner ?? ""} className={inputClass}>
            <option value="">{t.gameWinnerUnknown}</option>
            <option value="good">{t.gameWinnerGood}</option>
            <option value="evil">{t.gameWinnerEvil}</option>
          </select>
        </Field>
        <Field label={t.gamePlayers} name={id("players")} errors={fe.players}>
          <input id={id("players")} name="players" type="number" min={5} max={20} defaultValue={game?.players ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label={t.gameNotes} name={id("notes")} errors={fe.notes}>
        <input id={id("notes")} name="notes" maxLength={1000} defaultValue={game?.notes ?? ""} className={inputClass} />
      </Field>
      <RosterFields
        key={added}
        roster={roster}
        entered={game?.roster ?? []}
        bluffs={game?.demonBluffs ?? []}
        edition={editionOfScript(pick === "__custom" ? "" : pick)}
        locale={locale}
        id={id}
        t={t}
      />
      <div className="flex flex-wrap gap-2">
        {game ? (
          <>
            <Button type="submit" disabled={pending}>{pending ? t.gameSaving : t.gameSave}</Button>
            <Button type="button" variant="secondary" onClick={onDone} disabled={pending}>{t.gameCancel}</Button>
          </>
        ) : (
          <Button type="submit" variant="secondary" disabled={pending}>{pending ? t.gameAdding : t.gameAdd}</Button>
        )}
      </div>
    </form>
  );
}

/** Characters offered in the selects: with a base script its own characters by team first, else all by team. */
function roleGroups(edition: RoleEdition | null, locale: Locale, t: GameFormLabels) {
  const collator = new Intl.Collator(locale);
  const sorted = [...botcRoles].sort((a, b) => collator.compare(roleName(a, locale), roleName(b, locale)));
  const byTeam = (roles: BotcRole[]) =>
    roleTeams.map((team) => ({ label: t.roleTeams[team], roles: roles.filter((r) => r.team === team) })).filter((g) => g.roles.length > 0);
  if (!edition) return byTeam(sorted);
  return [...byTeam(sorted.filter((r) => r.edition === edition)), { label: t.roleOther, roles: sorted.filter((r) => r.edition !== edition) }];
}

/** "Who played what": a character select per player, folded away until something is entered. */
function RosterFields({
  roster,
  entered,
  bluffs,
  edition,
  locale,
  id,
  t,
}: {
  roster: RosterPlayer[];
  entered: RosterEntered[];
  bluffs: string[];
  edition: RoleEdition | null;
  locale: Locale;
  id: (name: string) => string;
  t: GameFormLabels;
}) {
  const groups = useMemo(() => roleGroups(edition, locale, t), [edition, locale, t]);
  const goodGroups = useMemo(
    () => groups.map((g) => ({ ...g, roles: g.roles.filter((r) => bluffTeams.includes(r.team)) })).filter((g) => g.roles.length > 0),
    [groups],
  );
  const initial = new Map(entered.map((e) => [e.registrationId, e]));
  return (
    <details open={entered.length > 0 || bluffs.length > 0} className="rounded-md border border-border px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">{t.rosterTitle}</summary>
      <p className="mt-1 mb-3 text-xs text-muted">{t.rosterHint}</p>
      {roster.length === 0 ? (
        <p className="text-muted">{t.rosterNobody}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {roster.map((p) => (
            <RoleSelect
              key={p.id}
              registrationId={p.id}
              nickname={p.nickname}
              entered={initial.get(p.id)}
              groups={groups}
              locale={locale}
              id={id}
              t={t}
            />
          ))}
        </div>
      )}
      <div className="mt-3 border-t border-border pt-3 pb-1">
        <p className="font-medium">{t.bluffsTitle}</p>
        <p className="mb-2 text-xs text-muted">{t.bluffsHint}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {Array.from({ length: BLUFF_COUNT }, (_, i) => (
            <BluffSelect key={i} id={id(`bluff${i + 1}`)} name={`bluff${i + 1}`} defaultValue={bluffs[i] ?? ""} groups={goodGroups} locale={locale} t={t} />
          ))}
        </div>
      </div>
    </details>
  );
}

/** One of the Demon's bluffs: a good character, with its icon. */
function BluffSelect({
  id,
  name,
  defaultValue,
  groups,
  locale,
  t,
}: {
  id: string;
  name: string;
  defaultValue: string;
  groups: { label: string; roles: BotcRole[] }[];
  locale: Locale;
  t: GameFormLabels;
}) {
  const [value, setValue] = useState(defaultValue);
  const role = findRole(value);
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized WebP from public/, no optimisation needed */}
        {role && <img src={roleIcon(role.id)} alt="" width={28} height={28} />}
      </span>
      <select id={id} name={name} value={value} onChange={(e) => setValue(e.target.value)} aria-label={t.bluffsTitle} className={`${inputClass} min-w-0 flex-1`}>
        <option value="">{t.roleUnknown}</option>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.roles.map((r) => (
              <option key={r.id} value={r.id}>{roleName(r, locale)}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/** A player's character; a Drunk, Lunatic, Marionette, Pixie, Philosopher or Apprentice also gets a select for the character tied to it. */
function RoleSelect({
  registrationId,
  nickname,
  entered,
  groups,
  locale,
  id,
  t,
}: {
  registrationId: number;
  nickname: string;
  entered: RosterEntered | undefined;
  groups: { label: string; roles: BotcRole[] }[];
  locale: Locale;
  id: (name: string) => string;
  t: GameFormLabels;
}) {
  const [value, setValue] = useState(entered ? (entered.role ?? SAT_OUT) : "");
  const [believed, setBelieved] = useState(entered?.believedRole ?? "");
  const role = findRole(value);
  const believedRole = findRole(believed);
  const linked = linkedRoleOf(value);
  const teams = linked?.teams;
  const roleId = id(`role-${registrationId}`);
  const believedId = id(`believed-${registrationId}`);
  return (
    <div className="flex items-start gap-2">
      <span className="flex h-[38px] w-7 shrink-0 items-center justify-center" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized WebP from public/, no optimisation needed */}
        {role ? <img src={roleIcon(role.id)} alt="" width={28} height={28} /> : value === STORYTELLER ? "🎩" : value === SAT_OUT ? "💤" : null}
      </span>
      <label htmlFor={roleId} className="w-24 shrink-0 truncate leading-[38px]" title={nickname}>{nickname}</label>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <select id={roleId} name={`role:${registrationId}`} value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} min-w-0`}>
          <option value="">{t.roleUnknown}</option>
          <option value={STORYTELLER}>{t.roleStoryteller}</option>
          <option value={SAT_OUT}>{t.roleSatOut}</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.roles.map((r) => (
                <option key={r.id} value={r.id}>{roleName(r, locale)}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {linked && teams && (
          <div className="flex items-center gap-2">
            <label htmlFor={believedId} className="shrink-0 text-xs text-muted" title={t.linkedHint[linked.kind]}>{t.linkedLabel[linked.kind]}</label>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized WebP from public/, no optimisation needed */}
              {believedRole && <img src={roleIcon(believedRole.id)} alt="" width={24} height={24} />}
            </span>
            <select
              id={believedId}
              name={`believed:${registrationId}`}
              value={believed}
              onChange={(e) => setBelieved(e.target.value)}
              title={t.linkedHint[linked.kind]}
              className={`${inputClass} min-w-0 flex-1 py-1 text-sm`}
            >
              <option value="">{t.roleUnknown}</option>
              {groups.map((g) => {
                const roles = g.roles.filter((r) => teams.includes(r.team));
                return roles.length === 0 ? null : (
                  <optgroup key={g.label} label={g.label}>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{roleName(r, locale)}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

/** A recorded game in the admin list: `children` shows it, „Upravit“ swaps it for the form with its values. */
export function GameItem({
  sessionId,
  scripts,
  roster,
  locale,
  game,
  deleteButton,
  children,
  t,
}: {
  sessionId: number;
  scripts: ScriptLink[];
  roster: RosterPlayer[];
  locale: Locale;
  game: EditedGame;
  deleteButton: ReactNode;
  children: ReactNode;
  t: GameFormLabels & { gameEdit: string };
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li className="rounded-md border border-border px-3 py-3">
        <GameForm sessionId={sessionId} scripts={scripts} roster={roster} locale={locale} game={game} onDone={() => setEditing(false)} t={t} />
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
      {children}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setEditing(true)}>{t.gameEdit}</Button>
        {deleteButton}
      </div>
    </li>
  );
}
