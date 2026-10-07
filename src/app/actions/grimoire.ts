"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { grimoireStateSchema } from "@/lib/grimoire/schema";
import { createGrimoire, deleteGrimoire, getGrimoire, saveGrimoire, type SaveResult } from "@/lib/grimoire/service";
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
  const me = await requireAdmin();
  if (parseId(id) === null) return;
  const deleted = await deleteGrimoire(me, id);
  if (deleted?.sessionId) revalidatePath(`/admin/termin/${deleted.sessionId}`);
  redirect("/admin/grimoary");
}
