"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { addGameAction, updateGameAction } from "@/app/actions/admin";
import type { Game, ScriptLink } from "@/db/schema";
import type { FormState } from "@/lib/validation";
import { keepValues } from "../keep-values";
import { Alert, Button, Field, inputClass } from "../ui";

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
};

type EditedGame = Pick<Game, "id" | "scriptName" | "scriptUrl" | "winner" | "players" | "notes">;

/**
 * Records one played game, or edits `game` when given; the script can be picked from the session's list or typed.
 * A new game empties the form after saving; an edited one calls `onDone`.
 */
export function GameForm({
  sessionId,
  scripts: sessionScripts,
  game,
  onDone,
  t,
}: {
  sessionId: number;
  scripts: ScriptLink[];
  game?: EditedGame;
  onDone?: () => void;
  t: GameFormLabels;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = game ? await updateGameAction(game.id, prev, formData) : await addGameAction(sessionId, prev, formData);
    if (result.ok) {
      if (onDone) onDone();
      else formRef.current?.reset();
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

/** A recorded game in the admin list: `children` shows it, „Upravit“ swaps it for the form with its values. */
export function GameItem({
  sessionId,
  scripts,
  game,
  deleteButton,
  children,
  t,
}: {
  sessionId: number;
  scripts: ScriptLink[];
  game: EditedGame;
  deleteButton: ReactNode;
  children: ReactNode;
  t: GameFormLabels & { gameEdit: string };
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li className="rounded-md border border-border px-3 py-3">
        <GameForm sessionId={sessionId} scripts={scripts} game={game} onDone={() => setEditing(false)} t={t} />
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
