import type { Locale } from "@/i18n/dictionaries";
import { findRole, roleIcon, roleName, roleSide, roleTeams, type RoleTeam } from "@/modules/botc/lib/botc-roles";
import { groupHeadingClass, splitByGroup } from "./team-section";

const chip = "inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pr-2.5 pl-1 text-xs";

/** Text colour of a character's side: good blue, evil red, travellers grey. */
export function sideClass(roleId: string) {
  const role = findRole(roleId);
  const side = role && roleSide(role.team);
  return side === "good" ? "text-good" : side === "evil" ? "text-accent" : "text-muted";
}

/** One character: icon and name. */
export function RoleChip({ roleId, locale }: { roleId: string; locale: Locale }) {
  const role = findRole(roleId);
  return (
    <span className={chip}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized WebP from public/, no optimisation needed */}
      <img src={roleIcon(roleId)} alt="" width={22} height={22} className="h-[22px] w-[22px]" />
      <span className={sideClass(roleId)}>{role ? roleName(role, locale) : roleId}</span>
    </span>
  );
}

/** The characters of a pick: one chip, or a bundle's chips joined by "+". */
export function OptionChips({ roleIds, locale }: { roleIds: string[]; locale: Locale }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {roleIds.map((id, i) => (
        <span key={id} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-muted">+</span>}
          <RoleChip roleId={id} locale={locale} />
        </span>
      ))}
    </span>
  );
}

/** Names of a pick's characters, "Choirboy + King". */
export function optionLabel(roleIds: string[], locale: Locale) {
  return roleIds
    .map((id) => {
      const role = findRole(id);
      return role ? roleName(role, locale) : id;
    })
    .join(" + ");
}

/** Character ids by team, then by the name shown in the language of the page. */
export function sortByShownName(roleIds: string[], locale: Locale) {
  const collator = new Intl.Collator(locale);
  const key = (id: string) => {
    const role = findRole(id);
    return { team: role ? roleTeams.indexOf(role.team) : roleTeams.length, name: role ? roleName(role, locale) : id };
  };
  return [...roleIds].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return x.team - y.team || collator.compare(x.name, y.name);
  });
}

/** A pool's characters in one row per team, the team's name in its colour in front. */
export function TeamRows({ roleIds, locale, labels }: { roleIds: string[]; locale: Locale; labels: Record<RoleTeam, string> }) {
  const groups = splitByGroup(sortByShownName(roleIds, locale), (id) => [id]);
  return (
    <div className="flex flex-col divide-y divide-border">
      {groups.map((g) => (
        <div key={g.group} className="flex flex-wrap items-center gap-1.5 py-1.5 first:pt-0 last:pb-0" data-team={g.group}>
          <span className={`w-28 shrink-0 text-xs font-semibold tracking-wide uppercase ${groupHeadingClass(g.group)}`}>
            {g.group === "bundles" ? "" : labels[g.group]} <span className="font-normal opacity-70">{g.items.length}</span>
          </span>
          {g.items.map((id) => (
            <RoleChip key={id} roleId={id} locale={locale} />
          ))}
        </div>
      ))}
    </div>
  );
}
