"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { grimoireStateSchema } from "@/modules/botc/lib/grimoire/schema";
import { createGrimoire, deleteGrimoire, getGrimoire, saveGrimoire, type SaveResult } from "@/modules/botc/lib/grimoire/service";
import type { GrimoireState } from "@/modules/botc/lib/grimoire/state";
import { parseScriptFile } from "@/modules/botc/lib/scripts";
import { parseId } from "@/lib/validation";

function optionalId(v: FormDataEntryValue | null) {
  return typeof v === "string" && v !== "" ? parseId(v) : null;
}

/** New grimoire – empty, from a session, or the next game of another one – then straight to it. */
export async function createGrimoireAction(formData: FormData) {
  const me = await requireAdmin();
  const { locale, t } = await getDict();
  const g = t.grimoire;
  const name = String(formData.get("name") ?? "").trim().slice(0, 100) || null;
  const id = await createGrimoire(
    me,
    { name, sessionId: optionalId(formData.get("sessionId")), scriptId: optionalId(formData.get("scriptId")), fromId: optionalId(formData.get("fromId")) },
    { allCharacters: g.allCharacters, untitled: g.untitled, nthGame: (title, n) => (n > 1 ? g.nthGame.replace("{title}", title).replace("{n}", String(n)) : title) },
    locale,
  );
  redirect(id ? `/admin/grimoary/${id}` : "/admin/grimoary?nenalezeno=1");
}

/** Autosave of the grimoire page; see saveGrimoire. */
export async function saveGrimoireAction(id: number, baseVersion: number, state: unknown, force: boolean): Promise<SaveResult | { invalid: true }> {
  const me = await requireAdmin();
  // bound in a client component, so it comes from the browser like any other value
  if (parseId(id) === null || !Number.isInteger(baseVersion)) return { notFound: true };
  const parsed = grimoireStateSchema.safeParse(state);
  if (!parsed.success) return { invalid: true };
  const result = await saveGrimoire(me, id, baseVersion, parsed.data, force === true);
  if ("ok" in result && result.recorded) {
    const row = await getGrimoire(id);
    if (row?.grimoire.sessionId) revalidatePath(`/admin/termin/${row.grimoire.sessionId}`);
    revalidatePath("/botc/archiv");
  }
  return result;
}

export async function deleteGrimoireAction(id: number) {
  const me = await requireAdmin("admin");
  if (parseId(id) === null) return;
  const deleted = await deleteGrimoire(me, id);
  if (deleted?.sessionId) revalidatePath(`/admin/termin/${deleted.sessionId}`);
  redirect("/admin/grimoary");
}

export type ReadScriptResult = { ok: true; script: GrimoireState["script"]; extras: string[] } | { error: string };

/** A script pasted or picked as a file in the grimoire: its name and the characters this site knows; nothing is saved. */
export async function readGrimoireScriptAction(text: string): Promise<ReadScriptResult> {
  await requireAdmin();
  const { t } = await getDict();
  const errors = t.scripts.errors;
  if (typeof text !== "string" || !text.trim()) return { error: errors.noFile };
  const parsed = parseScriptFile(text);
  if (!parsed.ok) return { error: errors[parsed.error] };
  if (parsed.script.roleIds.length === 0) return { error: errors.noCharacters };
  const name = (parsed.script.meta.name ?? t.grimoire.jsonScript).slice(0, 200);
  return { ok: true, script: { id: null, json: true, name, roleIds: parsed.script.roleIds }, extras: parsed.script.extras };
}
