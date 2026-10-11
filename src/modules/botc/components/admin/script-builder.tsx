"use client";

import { useActionState, useMemo, useState } from "react";
import type { ScriptFormState } from "@/modules/botc/actions/scripts";
import type { Dict, Locale } from "@/i18n/dictionaries";
import { plural } from "@/i18n/plural";
import {
  botcRoles,
  findRole,
  findStorytellerRole,
  homebrewCollections,
  homebrewRoles,
  homebrewStorytellerRoles,
  MAX_SCRIPT_NAME,
  roleIcon,
  roleName,
  roleTeams,
  storytellerRoles,
  type RoleTeam,
  type StorytellerTeam,
} from "@/modules/botc/lib/botc-roles";
import { keepValues } from "@/components/keep-values";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { sideClass } from "../draft/role-chips";
import { TeamSection } from "../draft/team-section";

type Team = RoleTeam | StorytellerTeam;
type Character = { id: string; team: Team; en: string; cs: string; collection?: string };

const teams: readonly Team[] = [...roleTeams, "fabled", "loric"];
const storytellerBox = "rounded-xl border border-amber-500/40 bg-amber-500/5 p-3";

/** Letters and digits in lower case without diacritics, for finding a character by its name in either language */
function plainText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Building a script from characters (admin → Scripty → Sestavit script, or a library script's characters): the
 * official ones by team, the Fabled and Loric, the homebrew ones collection by collection – with their ability,
 * as nobody knows them by heart – found by name in Czech or English. The picked characters go as hidden fields,
 * so a search that hides some of them does not drop them.
 */
export function ScriptBuilder({
  action,
  initial,
  abilities,
  teamLabels,
  locale,
  t,
}: {
  action: (prev: ScriptFormState, formData: FormData) => Promise<ScriptFormState>;
  initial: { name: string; author: string; picked: string[]; names?: Record<string, string> };
  /** The homebrew characters' abilities in the page's language */
  abilities: Record<string, string>;
  teamLabels: Record<Team, string>;
  locale: Locale;
  t: Dict["scripts"]["builder"];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initial.picked));
  const [query, setQuery] = useState("");
  // what this script calls its characters (scripts.names); a name of a character no longer picked is not sent
  const [renamed, setRenamed] = useState<Record<string, string>>(() => initial.names ?? {});
  // the collections with a character of the script open at the start, the others stay folded
  const [openAtStart] = useState(() => new Set(initial.picked.flatMap((id) => (findRole(id) ?? findStorytellerRole(id))?.collection ?? [])));
  const errors = state.fieldErrors ?? {};

  const q = plainText(query.trim());
  const matches = (c: Character) => !q || plainText(c.cs).includes(q) || plainText(c.en).includes(q);
  const name = (c: Character) => roleName(c, locale);

  const official = useMemo<Character[]>(() => [...botcRoles, ...storytellerRoles], []);
  const homebrew = useMemo<Character[]>(() => [...homebrewRoles, ...homebrewStorytellerRoles], []);
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);
  const sorted = (list: Character[]) => [...list].sort((a, b) => collator.compare(name(a), name(b)));

  const toggle = (id: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };

  /** The picked characters by team, the players' first */
  const pickedByTeam = teams
    .map((team) => ({
      team,
      characters: sorted(
        [...picked].flatMap((id): Character[] => {
          const c = findRole(id) ?? findStorytellerRole(id);
          return c && c.team === team ? [c] : [];
        }),
      ),
    }))
    .filter((g) => g.characters.length > 0);

  // the ability under the label, so the checkbox is named by the character alone
  const checkbox = (c: Character, withAbility = false) => (
    <div key={c.id} className="flex flex-col">
      <label className="flex items-start gap-1.5 text-sm">
        <input type="checkbox" checked={picked.has(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-accent" />
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized WebP from public/; lazy: most of the list is folded */}
        <img src={roleIcon(c.id)} alt="" width={20} height={20} loading="lazy" className="h-5 w-5 shrink-0" />
        <span className={sideClass(c.id)} title={c.en !== name(c) ? c.en : undefined}>
          {name(c)}
        </span>
      </label>
      {withAbility && abilities[c.id] && <p className="pl-12 text-xs leading-snug text-muted">{abilities[c.id]}</p>}
    </div>
  );

  const officialPlayers = roleTeams
    .map((team) => ({ team, characters: sorted(official.filter((c) => c.team === team && matches(c))) }))
    .filter((g) => g.characters.length > 0);
  const officialStoryteller = sorted(official.filter((c) => (c.team === "fabled" || c.team === "loric") && matches(c)));
  const collections = homebrewCollections
    .map((col) => ({ col, characters: homebrew.filter((c) => c.collection === col.key && matches(c)) }))
    .filter((g) => g.characters.length > 0);
  const nothingFound = q && !officialPlayers.length && !officialStoryteller.length && !collections.length;

  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="flex flex-col gap-5" data-testid="script-builder">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.name} name="name" errors={errors.name}>
          <input id="name" name="name" required maxLength={100} defaultValue={initial.name} className={inputClass} />
        </Field>
        <Field label={`${t.author} (${t.optional})`} name="author">
          <input id="author" name="author" maxLength={100} defaultValue={initial.author} className={inputClass} />
        </Field>
      </div>
      {[...picked].map((id) => (
        <input key={id} type="hidden" name="role" value={id} />
      ))}

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3" data-testid="builder-picked">
        <h2 className="text-sm font-semibold">
          {t.selected}: {plural(t.count, picked.size)}
        </h2>
        {pickedByTeam.length === 0 ? (
          <p className="text-sm text-muted">{t.nothing}</p>
        ) : (
          pickedByTeam.map(({ team, characters }) => (
            <div key={team} className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="w-28 shrink-0 text-xs font-semibold tracking-wide text-muted uppercase">
                {teamLabels[team]} {characters.length}
              </span>
              {characters.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized WebP from public/ */}
                  <img src={roleIcon(c.id)} alt="" width={16} height={16} className="h-4 w-4" />
                  <span className={sideClass(c.id)} title={renamed[c.id]?.trim() ? name(c) : undefined}>
                    {renamed[c.id]?.trim() || name(c)}
                  </span>
                  <button type="button" onClick={() => toggle(c.id, false)} aria-label={`${t.remove}: ${name(c)}`} className="text-muted hover:text-accent">
                    ✕
                  </button>
                </span>
              ))}
            </div>
          ))
        )}
        {pickedByTeam.length > 0 && (
          <details className="text-sm" open={Object.values(renamed).some((v) => v.trim()) || undefined} data-testid="builder-rename">
            <summary className="cursor-pointer font-medium">{t.renameTitle}</summary>
            <p className="mt-1 text-xs text-muted">{t.renameHint}</p>
            <div className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {pickedByTeam.flatMap(({ characters }) =>
                characters.map((c) => (
                  <label key={c.id} className="flex min-w-0 items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized WebP from public/ */}
                    <img src={roleIcon(c.id)} alt="" width={20} height={20} className="h-5 w-5 shrink-0" />
                    <span className={`w-24 shrink-0 truncate sm:w-32 ${sideClass(c.id)}`}>{name(c)}</span>
                    <input
                      name={`rename:${c.id}`}
                      value={renamed[c.id] ?? ""}
                      onChange={(e) => setRenamed({ ...renamed, [c.id]: e.target.value })}
                      maxLength={MAX_SCRIPT_NAME}
                      placeholder={name(c)}
                      aria-label={`${t.renameLabel}: ${name(c)}`}
                      className={`${inputClass} min-w-0 flex-1 py-1 text-sm`}
                    />
                  </label>
                )),
              )}
            </div>
          </details>
        )}
      </section>

      <Field label={t.search} name="builder-search">
        <input
          id="builder-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          className={inputClass}
        />
      </Field>
      {nothingFound && <p className="text-sm text-muted">{t.noMatch}</p>}

      {(officialPlayers.length > 0 || officialStoryteller.length > 0) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t.official}</h2>
          {officialPlayers.map(({ team, characters }) => (
            <TeamSection key={team} group={team as RoleTeam} label={teamLabels[team]}>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-4">{characters.map((c) => checkbox(c))}</div>
            </TeamSection>
          ))}
          {officialStoryteller.length > 0 && (
            <section className={storytellerBox}>
              <h3 className="mb-2 text-sm font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">{t.storyteller}</h3>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-4">{officialStoryteller.map((c) => checkbox(c))}</div>
            </section>
          )}
        </section>
      )}

      {collections.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t.homebrew}</h2>
          <p className="text-xs text-muted">{t.homebrewHint}</p>
          {collections.map(({ col, characters }) => {
            const count = characters.filter((c) => picked.has(c.id)).length;
            return (
              <details key={col.key} className="rounded-md border border-border p-2 text-sm" open={q ? true : openAtStart.has(col.key) || undefined} data-collection={col.key}>
                <summary className="cursor-pointer">
                  <span className="font-medium">{col.name}</span> <span className="text-xs text-muted">{count > 0 ? `${count} / ${characters.length}` : characters.length}</span>
                </summary>
                <div className="mt-2 flex flex-col gap-2">
                  {teams.map((team) => {
                    const ofTeam = sorted(characters.filter((c) => c.team === team));
                    if (!ofTeam.length) return null;
                    return (
                      <div key={team} className="flex flex-col gap-1">
                        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{teamLabels[team]}</h3>
                        <div className="grid gap-x-4 gap-y-1.5 md:grid-cols-2">{ofTeam.map((c) => checkbox(c, true))}</div>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </section>
      )}

      {/* the list is long: saving stays at hand at the bottom of the screen, as in the site texts' form */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button type="submit" disabled={pending}>{pending ? t.saving : t.save}</Button>
        <span className="text-sm text-muted">{plural(t.count, picked.size)}</span>
      </div>
    </form>
  );
}
