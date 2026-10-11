"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { scripts } from "@/db/schema";
import type { Dict } from "@/i18n/dictionaries";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { logAction } from "@/lib/admin-log";
import { findRole, findStorytellerRole } from "@/modules/botc/lib/botc-roles";
import {
  builtScriptItems,
  canEditScript,
  getLibraryScript,
  parseScriptFile,
  scriptNameTaken,
  scriptText,
  type ParsedScript,
} from "@/modules/botc/lib/scripts";
import type { FormState } from "@/lib/validation";
import type { SimpleResult } from "@/app/actions/admin";

/* The club's library of scripts (admin → Scripty, modules/botc/lib/scripts). */

export type ScriptFormState = FormState & { message?: string };

const MAX_NAME = 100;

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

/** The script from the chosen file, or else from the pasted text; null when neither was given. */
async function readScript(formData: FormData, t: Dict["scripts"]): Promise<{ script?: ParsedScript; error?: string } | null> {
  const file = formData.get("file");
  const raw = file instanceof File && file.size > 0 ? await file.text() : text(formData, "json");
  if (!raw) return null;
  const parsed = parseScriptFile(raw);
  return parsed.ok ? { script: parsed.script } : { error: t.errors[parsed.error] };
}

/**
 * Name and author as typed; a new script without them takes those in its file's "_meta". When editing, an
 * empty author removes it.
 */
async function nameAndAuthor(formData: FormData, t: Dict["scripts"], fromFile: ParsedScript["meta"] | null, exceptId?: number) {
  const name = (text(formData, "name") || fromFile?.name || "").slice(0, MAX_NAME);
  const author = (text(formData, "author") || fromFile?.author || "").slice(0, MAX_NAME) || null;
  if (!name) return { error: t.errors.noName };
  if (await scriptNameTaken(name, exceptId)) return { error: t.errors.nameTaken(name) };
  return { name, author };
}

function revalidateScripts() {
  revalidatePath("/admin/botc/scripty", "layout");
}

export async function createLibraryScriptAction(_prev: ScriptFormState, formData: FormData): Promise<ScriptFormState> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const s = t.scripts;
  const read = await readScript(formData, s);
  if (!read) return { error: s.errors.noFile, fieldErrors: { json: [s.errors.noFile] } };
  if (!read.script) return { error: read.error, fieldErrors: { json: [read.error!] } };
  const named = await nameAndAuthor(formData, s, read.script.meta);
  if (!named.name) return { error: named.error, fieldErrors: { name: [named.error!] } };
  const [row] = await db
    .insert(scripts)
    .values({
      name: named.name,
      author: named.author,
      json: scriptText(read.script.items, named.name, named.author),
      roleIds: read.script.roleIds,
      createdBy: me.id,
    })
    .returning({ id: scripts.id });
  await logAction(me, "script.create", { script: { id: row.id, name: named.name } });
  revalidateScripts();
  redirect(`/admin/botc/scripty/${row.id}`);
}

/** New name or author, and a new file when one is given (empty = the characters stay). */
export async function updateLibraryScriptAction(id: number, _prev: ScriptFormState, formData: FormData): Promise<ScriptFormState> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const s = t.scripts;
  const row = await getLibraryScript(id);
  if (!row) return { error: s.errors.notFound };
  if (!canEditScript(me, row.script)) return { error: s.errors.notYours };
  const read = await readScript(formData, s);
  let script: ParsedScript;
  if (read) {
    if (!read.script) return { error: read.error, fieldErrors: { json: [read.error!] } };
    script = read.script;
  } else {
    const current = parseScriptFile(row.script.json);
    if (!current.ok) return { error: s.errors.notScript };
    script = current.script;
  }
  const named = await nameAndAuthor(formData, s, null, id);
  if (!named.name) return { error: named.error, fieldErrors: { name: [named.error!] } };
  await db
    .update(scripts)
    .set({
      name: named.name,
      author: named.author,
      json: scriptText(script.items, named.name, named.author),
      roleIds: script.roleIds,
      updatedAt: new Date(),
    })
    .where(eq(scripts.id, id));
  await logAction(me, "script.update", { script: { id, name: named.name }, file: Boolean(read) });
  revalidateScripts();
  return { ok: true, message: read ? s.savedWithFile : s.saved };
}

/**
 * A script built from characters picked on the site (the script builder): a new one (`id` null) or the characters
 * of one in the library, whose own rules, logo and characters the site does not know stay.
 */
export async function saveBuiltScriptAction(id: number | null, _prev: ScriptFormState, formData: FormData): Promise<ScriptFormState> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const s = t.scripts;
  const row = id === null ? null : await getLibraryScript(id);
  if (id !== null && !row) return { error: s.errors.notFound };
  if (row && !canEditScript(me, row.script)) return { error: s.errors.notYours };
  const picked = [...new Set(formData.getAll("role").map(String))].filter((r) => findRole(r) || findStorytellerRole(r));
  if (!picked.some((r) => findRole(r))) return { error: s.builder.noCharacters };
  const name = text(formData, "name").slice(0, MAX_NAME);
  const author = text(formData, "author").slice(0, MAX_NAME) || null;
  if (!name) return { error: s.builder.noName, fieldErrors: { name: [s.builder.noName] } };
  if (await scriptNameTaken(name, id ?? undefined)) return { error: s.errors.nameTaken(name), fieldErrors: { name: [s.errors.nameTaken(name)] } };
  const previous = row ? parseScriptFile(row.script.json) : null;
  const json = scriptText(builtScriptItems(picked, previous?.ok ? previous.script.items : []), name, author);
  const parsed = parseScriptFile(json);
  if (!parsed.ok) return { error: s.errors[parsed.error] };
  const values = { name, author, json, roleIds: parsed.script.roleIds };
  let savedId = id;
  if (row && id !== null) {
    await db.update(scripts).set({ ...values, updatedAt: new Date() }).where(eq(scripts.id, id));
    await logAction(me, "script.update", { script: { id, name }, file: false, characters: true });
  } else {
    const [created] = await db.insert(scripts).values({ ...values, createdBy: me.id }).returning({ id: scripts.id });
    savedId = created.id;
    await logAction(me, "script.create", { script: { id: created.id, name } });
  }
  revalidateScripts();
  redirect(`/admin/botc/scripty/${savedId}`);
}

export async function deleteLibraryScriptAction(id: number): Promise<SimpleResult> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const row = await getLibraryScript(id);
  if (!row) return { message: t.scripts.errors.notFound };
  if (!canEditScript(me, row.script)) return { message: t.scripts.errors.notYours };
  await db.delete(scripts).where(eq(scripts.id, id));
  await logAction(me, "script.delete", { script: { id, name: row.script.name } });
  revalidateScripts();
  redirect("/admin/botc/scripty");
}
