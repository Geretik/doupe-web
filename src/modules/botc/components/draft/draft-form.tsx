"use client";

import { useActionState, useMemo, useState } from "react";
import type { MessageState } from "@/modules/botc/actions/draft";
import type { DraftModeId, DraftRoleSource } from "@/db/schema";
import { plural, type PluralForms } from "@/i18n/plural";
import type { RoleEdition, RoleTeam } from "@/modules/botc/lib/botc-roles";
import { roleIdsFromScriptJson } from "@/modules/botc/lib/draft/roles";
import { keepValues } from "@/components/keep-values";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { TeamSection } from "./team-section";

export type RoleItem = { id: string; team: RoleTeam; edition: RoleEdition; name: string; className: string };
export type ModeInfo = {
  id: DraftModeId;
  name: string;
  description: string;
  fields: { key: string; label: string; min: number; max: number; default: number }[];
};

export type DraftFormLabels = {
  name: string;
  note: string;
  optional: string;
  roles: string;
  sourceFilter: string;
  sourceManual: string;
  editions: string;
  teams: string;
  importTitle: string;
  importHint: string;
  importButton: string;
  importDone: string;
  importFailed: string;
  all: string;
  none: string;
  selected: string;
  bundles: string;
  bundlesHint: string;
  mode: string;
  submit: string;
  saving: string;
  offered: PluralForms;
};

export type DraftFormInitial = {
  name: string;
  note: string;
  roleSource: DraftRoleSource;
  bundlesText: string;
  mode: DraftModeId;
  config: Record<string, number>;
};

/** Setting up a draft or changing it before the start: the mode and its numbers, what is offered, bundles. */
export function DraftForm({
  action,
  initial,
  roles,
  teams,
  editions,
  modes,
  t,
}: {
  action: (prev: MessageState, formData: FormData) => Promise<MessageState>;
  initial: DraftFormInitial;
  roles: RoleItem[];
  teams: { id: RoleTeam; label: string }[];
  editions: { id: RoleEdition; label: string }[];
  modes: ModeInfo[];
  t: DraftFormLabels;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const src = initial.roleSource;
  const [kind, setKind] = useState<DraftRoleSource["kind"]>(src.kind);
  const [pickedEditions, setPickedEditions] = useState<Set<RoleEdition>>(
    new Set(src.kind === "filter" ? src.editions : editions.map((e) => e.id)),
  );
  const [pickedTeams, setPickedTeams] = useState<Set<RoleTeam>>(
    new Set(src.kind === "filter" ? src.teams : teams.filter((x) => x.id !== "traveller").map((x) => x.id)),
  );
  const [manual, setManual] = useState<Set<string>>(new Set(src.kind === "manual" ? src.roleIds : []));
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<"done" | "failed" | null>(null);
  const [modeId, setModeId] = useState<DraftModeId>(initial.mode);
  const mode = modes.find((m) => m.id === modeId);
  const errors = state.fieldErrors ?? {};

  const offeredCount = useMemo(
    () =>
      kind === "manual" ? manual.size : roles.filter((r) => pickedEditions.has(r.edition) && pickedTeams.has(r.team)).length,
    [kind, manual, roles, pickedEditions, pickedTeams],
  );

  const toggle = <T,>(set: Set<T>, value: T, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(value);
    else next.delete(value);
    return next;
  };

  const loadScript = () => {
    const ids = roleIdsFromScriptJson(importText);
    if (!ids) {
      setImportResult("failed");
      return;
    }
    setManual(new Set(ids));
    setImportResult("done");
  };

  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="flex flex-col gap-5">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert kind="success">{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.name} name="name" errors={errors.name}>
          <input id="name" name="name" required maxLength={100} defaultValue={initial.name} className={inputClass} />
        </Field>
        <Field label={`${t.note} (${t.optional})`} name="note">
          <input id="note" name="note" maxLength={1000} defaultValue={initial.note} className={inputClass} />
        </Field>
        <Field label={t.mode} name="mode" hint={mode?.description} errors={errors.mode}>
          <select id="mode" name="mode" value={modeId} onChange={(e) => setModeId(e.target.value as DraftModeId)} className={inputClass}>
            {modes.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </Field>
        {mode?.fields.map((f) => {
          const name = `${mode.id}.${f.key}`;
          return (
            <Field key={name} label={f.label} name={name} errors={errors[name]}>
              <input
                id={name}
                name={name}
                type="number"
                min={f.min}
                max={f.max}
                required
                defaultValue={modeId === initial.mode ? (initial.config[f.key] ?? f.default) : f.default}
                className={inputClass}
              />
            </Field>
          );
        })}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">{t.roles}</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="sourceKind" value="filter" checked={kind === "filter"} onChange={() => setKind("filter")} className="accent-accent" />
            {t.sourceFilter}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="sourceKind" value="manual" checked={kind === "manual"} onChange={() => setKind("manual")} className="accent-accent" />
            {t.sourceManual}
          </label>
        </div>

        {kind === "filter" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{t.editions}</span>
              {editions.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="edition"
                    value={e.id}
                    checked={pickedEditions.has(e.id)}
                    onChange={(ev) => setPickedEditions(toggle(pickedEditions, e.id, ev.target.checked))}
                    className="h-4 w-4 accent-accent"
                  />
                  {e.label}
                </label>
              ))}
              {errors.editions?.map((m) => <p key={m} className="text-xs text-accent">{m}</p>)}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{t.teams}</span>
              {teams.map((x) => (
                <label key={x.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="team"
                    value={x.id}
                    checked={pickedTeams.has(x.id)}
                    onChange={(ev) => setPickedTeams(toggle(pickedTeams, x.id, ev.target.checked))}
                    className="h-4 w-4 accent-accent"
                  />
                  {x.label}
                </label>
              ))}
              {errors.teams?.map((m) => <p key={m} className="text-xs text-accent">{m}</p>)}
            </div>
          </div>
        )}

        {kind === "manual" && (
          <div className="flex flex-col gap-3">
            <details className="rounded-md border border-border p-3 text-sm">
              <summary className="cursor-pointer font-medium">{t.importTitle}</summary>
              <p className="mt-2 text-xs text-muted">{t.importHint}</p>
              <textarea
                aria-label={t.importTitle}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={4}
                className={`${inputClass} mt-2 w-full font-mono text-xs`}
              />
              <div className="mt-2 flex items-center gap-3">
                <Button type="button" variant="secondary" onClick={loadScript}>{t.importButton}</Button>
                {importResult && (
                  <span className={`text-xs ${importResult === "done" ? "text-green-700 dark:text-green-400" : "text-accent"}`}>
                    {importResult === "done" ? t.importDone : t.importFailed}
                  </span>
                )}
              </div>
            </details>
            {teams.map((team) => {
              const ofTeam = roles.filter((r) => r.team === team.id);
              const count = ofTeam.filter((r) => manual.has(r.id)).length;
              return (
                <TeamSection
                  key={team.id}
                  group={team.id}
                  label={team.label}
                  count={`${count} / ${ofTeam.length} ${t.selected}`}
                  actions={
                    <>
                      <button type="button" className="underline" onClick={() => setManual(new Set([...manual, ...ofTeam.map((r) => r.id)]))}>
                        {t.all}
                      </button>
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setManual(new Set([...manual].filter((id) => !ofTeam.some((r) => r.id === id))))}
                      >
                        {t.none}
                      </button>
                    </>
                  }
                >
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-4">
                    {ofTeam.map((r) => (
                      <label key={r.id} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          name="role"
                          value={r.id}
                          checked={manual.has(r.id)}
                          onChange={(ev) => setManual(toggle(manual, r.id, ev.target.checked))}
                          className="h-4 w-4 accent-accent"
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized WebP from public/, no optimisation needed */}
                        <img src={`/botc/roles/${r.id}.webp`} alt="" width={20} height={20} className="h-5 w-5" />
                        <span className={r.className}>{r.name}</span>
                      </label>
                    ))}
                  </div>
                </TeamSection>
              );
            })}
            {errors.roles?.map((m) => <p key={m} className="text-xs text-accent">{m}</p>)}
          </div>
        )}
        <p className="text-sm text-muted" data-testid="offered-count">{plural(t.offered, offeredCount)}</p>
      </fieldset>

      <Field label={t.bundles} name="bundles" hint={t.bundlesHint} errors={errors.bundles}>
        <textarea id="bundles" name="bundles" rows={3} defaultValue={initial.bundlesText} className={`${inputClass} font-mono text-sm`} />
      </Field>

      <div>
        <Button type="submit" disabled={pending}>{pending ? t.saving : t.submit}</Button>
      </div>
    </form>
  );
}
