"use client";

import { findRole, roleTeams, type RoleTeam } from "@/lib/botc-roles";
import { groupHeadingClass } from "@/components/draft/team-section";
import { nameOf, RoleIcon, useGrimoire } from "./context";

/** A team's box in its colour */
export const teamBox: Record<RoleTeam, string> = {
  townsfolk: "border-good/40 bg-good/5",
  outsider: "border-good/25 bg-good/[0.03]",
  minion: "border-accent/30 bg-accent/[0.04]",
  demon: "border-accent/50 bg-accent/10",
  traveller: "border-border bg-border/20",
};

/**
 * Characters to tap, by team in the team colours: big targets for a finger. `marked` are highlighted
 * (the seat's character, the ones in the bag); `notes` adds a line under a name (who has it), `teamNote`
 * something next to a team's heading (the bag's counts). `wide` fills a whole screen with columns.
 */
export function RoleGrid({
  roleIds,
  marked,
  notes,
  teamNote,
  onPick,
  label,
  wide = false,
}: {
  roleIds: string[];
  marked: Set<string>;
  notes?: Map<string, string>;
  teamNote?: (team: RoleTeam) => React.ReactNode;
  onPick: (roleId: string) => void;
  /** For the buttons' accessible names, e.g. "Postava" */
  label?: string;
  wide?: boolean;
}) {
  const { locale, t } = useGrimoire();
  const collator = new Intl.Collator(locale);
  const groups = roleTeams
    .map((team) => ({
      team,
      ids: roleIds
        .filter((id) => findRole(id)?.team === team)
        .sort((a, b) => collator.compare(nameOf(a, locale), nameOf(b, locale))),
    }))
    .filter((g) => g.ids.length > 0);
  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => (
        <section key={g.team} className={`rounded-xl border p-2 ${teamBox[g.team]}`} data-team={g.team}>
          <h4 className={`mb-1.5 flex items-baseline justify-between gap-2 px-1 text-xs font-semibold tracking-wide uppercase ${groupHeadingClass(g.team)}`}>
            {t.teams[g.team]}
            {teamNote?.(g.team)}
          </h4>
          <div className={`grid gap-1.5 ${wide ? "grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]" : "grid-cols-2"}`}>
            {g.ids.map((id) => {
              const on = marked.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onPick(id)}
                  aria-pressed={on}
                  aria-label={label ? `${label}: ${nameOf(id, locale)}` : undefined}
                  className={`flex ${wide ? "min-h-14" : "min-h-12"} items-center gap-2 rounded-lg border px-1.5 py-1 text-left text-sm ${
                    on ? "border-accent bg-accent/10 font-semibold" : "border-border bg-card hover:border-accent/50"
                  }`}
                >
                  <RoleIcon roleId={id} size={wide ? 42 : 34} />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate">{nameOf(id, locale)}</span>
                    {notes?.get(id) && <span className="truncate text-xs font-normal text-muted">{notes.get(id)}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
