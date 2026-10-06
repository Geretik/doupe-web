"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { draftModeIds, type DraftModeSettings, type DraftRoleSource } from "@/db/schema";
import type { Dict } from "@/i18n/dictionaries";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { roleName, findRole, roleTeams } from "@/lib/botc-roles";
import { dispatchDraftEventsLater } from "@/lib/draft/events";
import { draftModes, isDraftMode, parseModeConfig } from "@/lib/draft/modes";
import { bundleProblems, parseBundles, roleEditions, sortRoleIds } from "@/lib/draft/roles";
import * as service from "@/lib/draft/service";
import { parseId, type FormState } from "@/lib/validation";
import type { SimpleResult } from "./admin";

/*
 * Server actions of the drafts (admin → Drafty). Each one checks the login and leaves what is allowed to
 * lib/draft/service, which decides on the rows it locked; here only forms are read and answers worded.
 */

type DraftT = Dict["draft"];

function errorText(t: DraftT, error: service.DraftError) {
  return t.errors[error];
}

/** Draft pages, and the admin menu with its "your turn" count. */
function revalidateDrafts() {
  revalidatePath("/admin", "layout");
}


function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

const MAX_NAME = 100;
const MAX_NOTE = 1000;

// ─── Drafts ──────────────────────────────────────────────────────────────────

function parseDraftForm(formData: FormData, t: DraftT): { values?: service.DraftInput; fieldErrors?: Record<string, string[]> } {
  const e = t.errors;
  const fieldErrors: Record<string, string[]> = {};
  const name = text(formData, "name").slice(0, MAX_NAME);
  if (!name) fieldErrors.name = [e.fillName];
  const note = text(formData, "note").slice(0, MAX_NOTE) || null;

  let roleSource: DraftRoleSource;
  if (formData.get("sourceKind") === "manual") {
    const roleIds = sortRoleIds(formData.getAll("role").map(String));
    if (!roleIds.length) fieldErrors.roles = [e.noRoles];
    roleSource = { kind: "manual", roleIds };
  } else {
    const picked = new Set(formData.getAll("edition").map(String));
    const editions = roleEditions.filter((x) => picked.has(x));
    const pickedTeams = new Set(formData.getAll("team").map(String));
    const teams = roleTeams.filter((x) => pickedTeams.has(x));
    if (!editions.length) fieldErrors.editions = [e.noEditions];
    if (!teams.length) fieldErrors.teams = [e.noTeams];
    roleSource = { kind: "filter", editions, teams };
  }

  const { bundles, unknown } = parseBundles(String(formData.get("bundles") ?? ""));
  const bundleErrors: string[] = [];
  if (unknown.length) bundleErrors.push(e.bundleUnknown(unknown.join(", ")));
  for (const p of bundleProblems(bundles)) {
    bundleErrors.push(p.kind === "tooSmall" ? e.bundleTooSmall : e.bundleOverlap(findRole(p.roleId)?.en ?? p.roleId));
  }
  if (bundleErrors.length) fieldErrors.bundles = [...new Set(bundleErrors)];

  const modes = draftModeIds.filter((m) => formData.getAll("modes").includes(m));
  if (!modes.length) fieldErrors.modes = [e.noModes];

  const modeDefaults: DraftModeSettings = {};
  for (const id of draftModeIds) {
    const mode = draftModes[id];
    const { config, invalid } = parseModeConfig(mode, formData);
    for (const f of invalid) fieldErrors[`${id}.${f.key}`] = [e.number(f.min, f.max)];
    modeDefaults[id] = config;
  }

  if (Object.keys(fieldErrors).length) return { fieldErrors };
  return { values: { name, note, roleSource, bundles: bundles.map(sortRoleIds), modes, modeDefaults } };
}

export async function createDraftAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const parsed = parseDraftForm(formData, t.draft);
  if (!parsed.values) return { error: t.draft.errors.checkForm, fieldErrors: parsed.fieldErrors };
  const draft = await service.createDraft(me, parsed.values);
  revalidateDrafts();
  redirect(`/admin/drafty/${draft.id}`);
}

export type MessageState = FormState & { message?: string };

export async function updateDraftAction(draftId: number, _prev: MessageState, formData: FormData): Promise<MessageState> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const parsed = parseDraftForm(formData, t.draft);
  if (!parsed.values) return { error: t.draft.errors.checkForm, fieldErrors: parsed.fieldErrors };
  const r = await service.updateDraft(me, draftId, parsed.values);
  if (!r.ok) return { error: errorText(t.draft, r.error) };
  revalidateDrafts();
  return { ok: true, message: t.draft.form.saved };
}

export async function deleteDraftAction(draftId: number): Promise<SimpleResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const r = await service.deleteDraft(me, draftId);
  if (!r.ok) return { message: errorText(t.draft, r.error) };
  revalidateDrafts();
  redirect("/admin/drafty");
}

// ─── Sessions ────────────────────────────────────────────────────────────────

function parseSessionSettings(formData: FormData, t: DraftT): { values?: service.SessionSettings; fieldErrors?: Record<string, string[]> } {
  const fieldErrors: Record<string, string[]> = {};
  const name = text(formData, "name").slice(0, MAX_NAME);
  if (!name) fieldErrors.name = [t.errors.fillName];
  const modeId = String(formData.get("mode") ?? "");
  if (!isDraftMode(modeId)) return { fieldErrors: { ...fieldErrors, mode: [t.errors.modeNotAllowed] } };
  const mode = draftModes[modeId];
  const { config, invalid } = parseModeConfig(mode, formData);
  for (const f of invalid) fieldErrors[`${modeId}.${f.key}`] = [t.errors.number(f.min, f.max)];
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  return { values: { name, mode: modeId, config } };
}

export async function createSessionAction(draftId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const { locale, t } = await getDict();
  const parsed = parseSessionSettings(formData, t.draft);
  if (!parsed.values) return { error: t.draft.errors.checkForm, fieldErrors: parsed.fieldErrors };
  const r = await service.createSession(me, draftId, parsed.values, locale);
  if (!r.ok) return { error: errorText(t.draft, r.error) };
  revalidateDrafts();
  redirect(`/admin/drafty/session/${r.sessionId}`);
}

export async function updateSessionSettingsAction(sessionId: number, _prev: MessageState, formData: FormData): Promise<MessageState> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const parsed = parseSessionSettings(formData, t.draft);
  if (!parsed.values) return { error: t.draft.errors.checkForm, fieldErrors: parsed.fieldErrors };
  const r = await service.updateSessionSettings(me, sessionId, parsed.values);
  if (!r.ok) return { error: errorText(t.draft, r.error) };
  revalidateDrafts();
  return { ok: true, message: t.draft.settingsSaved };
}

export async function inviteMembersAction(sessionId: number, _prev: MessageState, formData: FormData): Promise<MessageState> {
  const me = await requireAdmin();
  const { locale, t } = await getDict();
  const userIds = formData.getAll("userId").map(parseId).filter((id): id is number => id !== null);
  if (!userIds.length) return { error: t.draft.inviteNobody };
  const role = formData.get("role") === "organizer" ? "organizer" : "participant";
  const r = await service.inviteMembers(me, sessionId, { userIds, role, drafts: formData.get("drafts") === "on" }, locale);
  if (!r.ok) return { error: errorText(t.draft, r.error) };
  dispatchDraftEventsLater();
  revalidateDrafts();
  return { ok: true, message: r.invited.length ? t.draft.invited(r.invited.join(", ")) : undefined };
}

/** Runs a one-click change of a session and words its answer. */
async function sessionChange(run: (me: Awaited<ReturnType<typeof requireAdmin>>) => Promise<service.Result>, notify = false): Promise<SimpleResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const r = await run(me);
  revalidateDrafts();
  if (!r.ok) return { message: errorText(t.draft, r.error) };
  if (notify) dispatchDraftEventsLater();
  return { ok: true };
}

export async function respondInviteAction(sessionId: number, accept: boolean): Promise<SimpleResult> {
  const { locale } = await getDict();
  return sessionChange((me) => service.respondToInvite(me, sessionId, accept, locale));
}

export async function updateMemberAction(sessionId: number, memberId: number, patch: service.MemberPatch): Promise<SimpleResult> {
  return sessionChange((me) => service.updateMember(me, sessionId, memberId, patch));
}

export async function removeMemberAction(sessionId: number, memberId: number): Promise<SimpleResult> {
  return sessionChange((me) => service.removeMember(me, sessionId, memberId));
}

export async function moveMemberAction(sessionId: number, memberId: number, delta: -1 | 1): Promise<SimpleResult> {
  return sessionChange((me) => service.moveMember(me, sessionId, memberId, delta === -1 ? -1 : 1));
}

export async function shuffleOrderAction(sessionId: number): Promise<SimpleResult> {
  return sessionChange((me) => service.shuffleOrder(me, sessionId));
}

export async function startSessionAction(sessionId: number): Promise<SimpleResult> {
  return sessionChange((me) => service.startSession(me, sessionId), true);
}

export async function cancelSessionAction(sessionId: number): Promise<SimpleResult> {
  return sessionChange((me) => service.cancelSession(me, sessionId), true);
}

// ─── Drafting ────────────────────────────────────────────────────────────────

export type PickState = { ok?: boolean; error?: string; message?: string };

/** One pick from the pick board; any refusal re-renders the page with the current state. */
export async function pickAction(sessionId: number, _prev: PickState, formData: FormData): Promise<PickState> {
  const me = await requireAdmin();
  const { locale, t } = await getDict();
  const optionId = parseId(formData.get("optionId"));
  const expectedPick = parseId(formData.get("pickNumber"));
  let r: service.PickResult;
  if (!optionId || !expectedPick) r = { ok: false, error: "stale" };
  else {
    try {
      r = await service.makePick(me, sessionId, optionId, expectedPick);
    } catch (e) {
      // the unique indexes of draft_picks stopped a second pick that got past the checks
      if ((e as { code?: string; cause?: { code?: string } })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505") {
        r = { ok: false, error: "stale" };
      } else throw e;
    }
  }
  revalidateDrafts();
  if (!r.ok) return { error: errorText(t.draft, r.error) };
  dispatchDraftEventsLater();
  const names = r.roleIds.map((id) => {
    const role = findRole(id);
    return role ? roleName(role, locale) : id;
  });
  return { ok: true, message: t.draft.picked(names.join(" + ")) };
}

// ─── Scripts ─────────────────────────────────────────────────────────────────

export async function createScriptAction(sessionId: number, poolId: number): Promise<SimpleResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const r = await service.createScript(me, sessionId, poolId);
  if (!r.ok) return { message: errorText(t.draft, r.error) };
  revalidateDrafts();
  redirect(`/admin/drafty/script/${r.scriptId}`);
}

export async function saveScriptAction(scriptId: number, _prev: MessageState, formData: FormData): Promise<MessageState> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const name = text(formData, "name").slice(0, MAX_NAME);
  if (!name) return { error: t.draft.errors.checkForm, fieldErrors: { name: [t.draft.errors.fillName] } };
  const author = text(formData, "author").slice(0, MAX_NAME) || null;
  const version = parseId(formData.get("version")) ?? 0;
  const r = await service.saveScript(me, scriptId, { name, author, roleIds: formData.getAll("role").map(String), version });
  if (!r.ok) return { error: errorText(t.draft, r.error) };
  revalidateDrafts();
  return { ok: true, message: t.draft.scriptForm.saved };
}

export async function deleteScriptAction(scriptId: number): Promise<SimpleResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const r = await service.deleteScript(me, scriptId);
  if (!r.ok) return { message: errorText(t.draft, r.error) };
  revalidateDrafts();
  redirect(`/admin/drafty/session/${r.sessionId}`);
}
