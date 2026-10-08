import type { Draft, DraftSession } from "@/db/schema";
import type { Dict, Locale } from "@/i18n/dictionaries";
import { botcRoles, findRole, roleName, roleTeams } from "@/modules/botc/lib/botc-roles";
import { draftModes, normalizeModeConfig } from "@/modules/botc/lib/draft/modes";
import { DEFAULT_BUNDLES, defaultDraftTeams, roleEditions } from "@/modules/botc/lib/draft/roles";
import type { PrepState } from "@/modules/botc/lib/draft/state";
import type { DraftFormInitial, DraftFormLabels, ModeInfo, RoleItem } from "./draft-form";
import { sideClass } from "./role-chips";

/** Labels and settings of all modes for the draft form (client components get plain data). */
export function modeInfos(t: Dict): ModeInfo[] {
  return Object.values(draftModes).map((m) => {
    const labels = t.draft.modes[m.id];
    return {
      id: m.id,
      name: labels.name,
      description: labels.description,
      fields: m.fields.map((f) => ({ ...f, label: labels.fields[f.key] ?? f.key })),
    };
  });
}

/** "Personal Pool · 15 roles per player" */
export function modeSummary(t: Dict, session: Pick<DraftSession, "mode" | "modeConfig">) {
  return `${t.draft.modes[session.mode].name} · ${t.draft.modeSummary[session.mode](session.modeConfig)}`;
}

/** Every character for the manual pick of the draft form, by team and by the name shown. */
export function roleItems(locale: Locale): RoleItem[] {
  const collator = new Intl.Collator(locale);
  return botcRoles
    .map((r) => ({ id: r.id, team: r.team, edition: r.edition, name: roleName(r, locale), className: sideClass(r.id) }))
    .sort((a, b) => roleTeams.indexOf(a.team) - roleTeams.indexOf(b.team) || collator.compare(a.name, b.name));
}

const badgeBase = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

/** Status of a draft; "preparing" told apart as being set up / waiting for players / ready. */
export function StatusBadge({ t, status, prepState }: { t: Dict; status: DraftSession["status"]; prepState?: PrepState }) {
  const label = status === "preparing" && prepState ? t.draft.prepState[prepState] : t.draft.status[status];
  const cls =
    status === "active"
      ? "border-good/40 text-good"
      : status === "completed"
        ? "border-green-600/40 text-green-800 dark:text-green-300"
        : "border-border text-muted";
  return <span className={`${badgeBase} ${cls}`}>{label}</span>;
}

/** "YOUR TURN" – the one thing a drafter must not miss. */
export function YourTurnBadge({ t }: { t: Dict }) {
  return <span className={`${badgeBase} border-accent bg-accent text-accent-foreground`}>{t.draft.yourTurn}</span>;
}

/** Everything the draft form shows besides its values. */
export function draftFormProps(t: Dict, locale: Locale, submit: string) {
  const labels: DraftFormLabels = { ...t.draft.form, submit, offered: t.draft.offered };
  return {
    roles: roleItems(locale),
    teams: roleTeams.map((id) => ({ id, label: t.admin.session.roleTeams[id] })),
    editions: roleEditions.map((id) => ({ id, label: t.draft.editionNames[id] })),
    modes: modeInfos(t),
    t: labels,
  };
}

/** Bundles as the form edits them: one per line, English names joined by "+". */
export function bundlesText(bundles: readonly (readonly string[])[]) {
  return bundles.map((b) => b.map((id) => findRole(id)?.en ?? id).join(" + ")).join("\n");
}

/** The draft form's values: those of a draft being prepared, or the defaults of a new one. */
export function draftFormInitial(draft?: { setup: Draft; run: DraftSession }): DraftFormInitial {
  if (draft) {
    return {
      name: draft.setup.name,
      note: draft.setup.note ?? "",
      roleSource: draft.setup.roleSource,
      bundlesText: bundlesText(draft.setup.bundles),
      mode: draft.run.mode,
      config: draft.run.modeConfig,
    };
  }
  return {
    name: "",
    note: "",
    roleSource: { kind: "filter", editions: [...roleEditions], teams: [...defaultDraftTeams] },
    bundlesText: bundlesText(DEFAULT_BUNDLES),
    mode: "personal",
    config: normalizeModeConfig(draftModes.personal),
  };
}
