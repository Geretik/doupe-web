"use client";

import { useActionState } from "react";
import { voteScriptsAction, type VoteResult } from "@/app/actions/registration";
import type { Dict } from "@/i18n/dictionaries";
import { plural } from "@/i18n/plural";
import { keepValues } from "./keep-values";
import { Alert, Button } from "./ui";

export type VoteOption = { name: string; url: string; votes: number };

/** The player's vote on their edit page: a checkbox per offered script with its current count. */
export function ScriptVoteForm({
  token,
  options,
  mine,
  open,
  t,
}: {
  token: string;
  options: VoteOption[];
  /** names the player voted for */
  mine: string[];
  open: boolean;
  t: Dict["poll"];
}) {
  const [state, action, pending] = useActionState<VoteResult, FormData>(voteScriptsAction.bind(null, token), {});
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-3" data-testid="script-vote">
      <h2 className="text-lg font-semibold">🗳️ {t.title}</h2>
      {open ? <p className="text-sm text-muted">{t.intro}</p> : <Alert kind="info">{t.closed}</Alert>}
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="success">{t.saved}</Alert>}
      <ul className="flex flex-col gap-2">
        {options.map((o) => (
          <li key={o.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-sm">
            <label className="flex flex-1 items-center gap-3">
              <input
                type="checkbox"
                name="script"
                value={o.name}
                defaultChecked={mine.includes(o.name)}
                disabled={!open}
                className="h-4 w-4 accent-accent"
              />
              <span className="font-medium">{o.name}</span>
            </label>
            {o.url && (
              <a href={o.url} target="_blank" rel="noreferrer" className="text-muted underline hover:text-accent">
                {t.openScript}
              </a>
            )}
            <span className="text-muted tabular-nums">{plural(t.votes, state.counts?.[o.name] ?? o.votes)}</span>
          </li>
        ))}
      </ul>
      {open && (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? t.saving : t.save}
          </Button>
        </div>
      )}
    </form>
  );
}
