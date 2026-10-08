import type { ReactNode } from "react";
import { findRole, roleTeams, type RoleTeam } from "@/modules/botc/lib/botc-roles";

/** A group of characters: a team, or the bundles (characters drafted together, often of two teams). */
export type GroupKey = RoleTeam | "bundles";

/** Good teams blue, evil teams red, the rest neutral – the colours of the characters' names. */
const box: Record<GroupKey, string> = {
  bundles: "border-border bg-card",
  townsfolk: "border-good/40 bg-good/5",
  outsider: "border-good/25 bg-good/[0.03]",
  minion: "border-accent/30 bg-accent/[0.04]",
  demon: "border-accent/50 bg-accent/10",
  traveller: "border-border bg-border/20",
};
const heading: Record<GroupKey, string> = {
  bundles: "text-foreground",
  townsfolk: "text-good",
  outsider: "text-good",
  minion: "text-accent",
  demon: "text-accent",
  traveller: "text-muted",
};

/** Text colour of a group's name. */
export function groupHeadingClass(group: GroupKey) {
  return heading[group];
}

/** One team (or the bundles) in a box of its colour, so the teams stand apart at a glance. */
export function TeamSection({
  group,
  label,
  count,
  actions,
  children,
}: {
  group: GroupKey;
  label: string;
  count?: ReactNode;
  /** Controls next to the heading, e.g. "all / none" */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-xl border p-3 ${box[group]}`} data-team={group}>
      <h3 className={`mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm font-semibold tracking-wide uppercase ${heading[group]}`}>
        {label}
        {count !== undefined && <span className="text-xs font-normal tracking-normal normal-case opacity-70">{count}</span>}
        {actions && <span className="flex gap-2 text-xs font-normal tracking-normal normal-case text-foreground">{actions}</span>}
      </h3>
      {children}
    </section>
  );
}

/** The team of a group of characters; a group with characters of several teams counts as bundles. */
export function groupOf(roleIds: string[]): GroupKey {
  if (roleIds.length > 1) return "bundles";
  return findRole(roleIds[0])?.team ?? "traveller";
}

/** Items split into the bundles first, then the teams in their order; empty groups left out. */
export function splitByGroup<T>(items: T[], roleIds: (item: T) => string[]): { group: GroupKey; items: T[] }[] {
  const order: GroupKey[] = ["bundles", ...roleTeams];
  return order
    .map((group) => ({ group, items: items.filter((i) => groupOf(roleIds(i)) === group) }))
    .filter((g) => g.items.length > 0);
}
