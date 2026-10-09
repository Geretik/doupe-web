"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { drafts, draftSessionMembers, type AdminUser, type DraftRoleSource } from "@/db/schema";
import type { Dict } from "@/i18n/dictionaries";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { draftScriptRef, logAction, logDraftAction } from "@/lib/admin-log";
import { roleName, findRole, roleTeams } from "@/modules/botc/lib/botc-roles";
import { dispatchDraftEventsLater } from "@/modules/botc/lib/draft/events";
import { draftModes, isDraftMode, parseModeConfig } from "@/modules/botc/lib/draft/modes";
import { bundleProblems, parseBundles, roleEditions, sortRoleIds } from "@/modules/botc/lib/draft/roles";
import * as service from "@/modules/botc/lib/draft/service";
import { parseId, type FormState } from "@/lib/validation";
import type { SimpleResult } from "@/app/actions/admin";

/*
 * Server actions of the drafts (admin → Drafty). Each one checks the login and leaves what is allowed to
 * modules/botc/lib/draft/service, which decides on the rows it locked; here only forms are read and answers worded.
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

  const modeId = String(formData.get("mode") ?? "");
  if (!isDraftMode(modeId)) return { fieldErrors: { ...fieldErrors, mode: [e.checkForm] } };
  const { config, invalid } = parseModeConfig(draftModes[modeId], formData);
  for (const f of invalid) fieldErrors[`${modeId}.${f.key}`] = [e.number(f.min, f.max)];

  if (Object.keys(fieldErrors).length) return { fieldErrors };
  return { values: { name, note, roleSource, bundles: bundles.map(sortRoleIds), mode: modeId, config } };
}

/** A new draft, owned by whoever sets it up; they invite the others on its page. */
export async function createDraftAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const { locale, t } = await getDict();
  const parsed = parseDraftForm(formData, t.draft);
  if (!parsed.values) return { error: t.draft.errors.checkForm, fieldErrors: parsed.fieldErrors };
  const { draftId } = await service.createDraft(me, parsed.values, locale);
  await logAction(me, "draft.create", { draft: { id: draftId, name: parsed.values.name } });
  revalidateDrafts();
  redirect(`/admin/botc/drafty/${draftId}`);
}

export type MessageState = FormState & { message?: string };

/** The draft's settings while it is being prepared; `sessionId` is its run, which the change locks. */
export async function updateDraftAction(sessionId: number, _prev: MessageState, formData: FormData): Promise<MessageState> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const parsed = parseDraftForm(formData, t.draft);
  if (!parsed.values) return { error: t.draft.errors.checkForm, fieldErrors: parsed.fieldErrors };
  const r = await service.updateDraft(me, sessionId, parsed.values);
  if (!r.ok) return { error: errorText(t.draft, r.error) };
  await logDraftAction(me, "draft.update", sessionId, {});
  revalidateDrafts();
  return { ok: true, message: t.draft.form.saved };
}

export async function deleteDraftAction(draftId: number): Promise<SimpleResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const draft = await db.query.drafts.findFirst({ where: eq(drafts.id, draftId), columns: { id: true, name: true } });
  const r = await service.deleteDraft(me, draftId);
  if (!r.ok) return { message: errorText(t.draft, r.error) };
  if (draft) await logAction(me, "draft.delete", { draft });
  revalidateDrafts();
  redirect("/admin/botc/drafty");
}

// ─── Preparing ───────────────────────────────────────────────────────────────

export async function inviteMembersAction(sessionId: number, _prev: MessageState, formData: FormData): Promise<MessageState> {
  const me = await requireAdmin();
  const { locale, t } = await getDict();
  const userIds = formData.getAll("userId").map(parseId).filter((id): id is number => id !== null);
  if (!userIds.length) return { error: t.draft.inviteNobody };
  const role = formData.get("role") === "organizer" ? "organizer" : "participant";
  const r = await service.inviteMembers(me, sessionId, { userIds, role, drafts: formData.get("drafts") === "on" }, locale);
  if (!r.ok) return { error: errorText(t.draft, r.error) };
  if (r.invited.length) await logDraftAction(me, "draft.invite", sessionId, { nicknames: r.invited });
  dispatchDraftEventsLater();
  revalidateDrafts();
  return { ok: true, message: r.invited.length ? t.draft.invited(r.invited.join(", ")) : undefined };
}

/** Runs a one-click change of a session, logs it once it went through and words its answer. */
async function sessionChange(run: (me: AdminUser) => Promise<service.Result>, log: (me: AdminUser) => Promise<void>, notify = false): Promise<SimpleResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const r = await run(me);
  revalidateDrafts();
  if (!r.ok) return { message: errorText(t.draft, r.error) };
  await log(me);
  if (notify) dispatchDraftEventsLater();
  return { ok: true };
}

/** A member's nickname for the history, read before the change (removing one deletes it). */
async function memberNickname(memberId: number) {
  const m = await db.query.draftSessionMembers.findFirst({ where: eq(draftSessionMembers.id, memberId), columns: { nickname: true } });
  return m?.nickname ?? "?";
}

export async function respondInviteAction(sessionId: number, accept: boolean): Promise<SimpleResult> {
  const { locale } = await getDict();
  return sessionChange(
    (me) => service.respondToInvite(me, sessionId, accept, locale),
    (me) => logDraftAction(me, "draft.respond", sessionId, { accept }),
  );
}

export async function updateMemberAction(sessionId: number, memberId: number, patch: service.MemberPatch): Promise<SimpleResult> {
  const member = await memberNickname(memberId);
  return sessionChange(
    (me) => service.updateMember(me, sessionId, memberId, patch),
    (me) => logDraftAction(me, "draft.member", sessionId, { member, role: patch.role, drafts: patch.drafts }),
  );
}

export async function removeMemberAction(sessionId: number, memberId: number): Promise<SimpleResult> {
  const member = await memberNickname(memberId);
  return sessionChange(
    (me) => service.removeMember(me, sessionId, memberId),
    (me) => logDraftAction(me, "draft.remove", sessionId, { member }),
  );
}

export async function moveMemberAction(sessionId: number, memberId: number, delta: -1 | 1): Promise<SimpleResult> {
  const member = await memberNickname(memberId);
  const step = delta === -1 ? -1 : 1;
  return sessionChange(
    (me) => service.moveMember(me, sessionId, memberId, step),
    (me) => logDraftAction(me, "draft.move", sessionId, { member, delta: step }),
  );
}

export async function shuffleOrderAction(sessionId: number): Promise<SimpleResult> {
  return sessionChange(
    (me) => service.shuffleOrder(me, sessionId),
    (me) => logDraftAction(me, "draft.shuffle", sessionId, {}),
  );
}

export async function startDraftAction(sessionId: number): Promise<SimpleResult> {
  return sessionChange(
    (me) => service.startSession(me, sessionId),
    (me) => logDraftAction(me, "draft.start", sessionId, {}),
    true,
  );
}

export async function cancelDraftAction(sessionId: number): Promise<SimpleResult> {
  return sessionChange(
    (me) => service.cancelSession(me, sessionId),
    (me) => logDraftAction(me, "draft.cancel", sessionId, {}),
    true,
  );
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
  await logDraftAction(me, "draft.pick", sessionId, { roleIds: r.roleIds });
  dispatchDraftEventsLater();
  const names = r.roleIds.map((id) => {
    const role = findRole(id);
    return role ? roleName(role, locale) : id;
  });
  return { ok: true, message: t.draft.picked(names.join(" + ")) };
}

// ─── Scripts ─────────────────────────────────────────────────────────────────

async function logDraftScript(me: AdminUser, action: "draft.scriptCreate" | "draft.scriptSave", scriptId: number) {
  const ref = await draftScriptRef(scriptId);
  if (ref) await logAction(me, action, ref);
}

export async function createScriptAction(sessionId: number, poolId: number): Promise<SimpleResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const r = await service.createScript(me, sessionId, poolId);
  if (!r.ok) return { message: errorText(t.draft, r.error) };
  await logDraftScript(me, "draft.scriptCreate", r.scriptId);
  revalidateDrafts();
  redirect(`/admin/botc/drafty/script/${r.scriptId}`);
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
  await logDraftScript(me, "draft.scriptSave", scriptId);
  revalidateDrafts();
  return { ok: true, message: t.draft.scriptForm.saved };
}

export async function saveScriptToLibraryAction(scriptId: number): Promise<SimpleResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const r = await service.saveScriptToLibrary(me, scriptId);
  if (!r.ok) return { message: errorText(t.draft, r.error) };
  const ref = await draftScriptRef(scriptId);
  if (ref) await logAction(me, "draft.scriptLibrary", { ...ref, libraryId: r.libraryId, updated: r.updated });
  revalidateDrafts();
  return { ok: true, message: r.updated ? t.draft.updatedInLibrary : t.draft.savedToLibrary };
}

export async function deleteScriptAction(scriptId: number): Promise<SimpleResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const ref = await draftScriptRef(scriptId);
  const r = await service.deleteScript(me, scriptId);
  if (!r.ok) return { message: errorText(t.draft, r.error) };
  if (ref) await logAction(me, "draft.scriptDelete", ref);
  revalidateDrafts();
  redirect(`/admin/botc/drafty/${r.draftId}`);
}
