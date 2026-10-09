"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { siteTexts } from "@/db/schema";
import { getDict, isLocale } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { logAction } from "@/lib/admin-log";
import { latestVersions } from "@/lib/site-content";
import { MAX_TEXT_LENGTH, sitePage, type TextBlock } from "@/lib/site-content-defaults";
import type { FormState } from "@/lib/validation";

export type SiteTextsState = FormState & { message?: string };

/**
 * Saves the texts of one page in one language. The form sends what the submit button says in `intent`:
 * - "save": the blocks sent as `body:<key>` (formatted blocks only once they were edited),
 * - "default:<key>": the block goes back to the text in the code,
 * - "restore:<version id>": an earlier version of a block comes back.
 * Every change is a new row, so nothing is ever overwritten. `rev:<key>` is the version the editor started
 * from: when someone else saved the block in the meantime, nothing is saved and the editor keeps what was typed.
 */
export async function saveSiteTextsAction(
  slug: string,
  locale: string,
  _prev: SiteTextsState,
  formData: FormData,
): Promise<SiteTextsState> {
  const me = await requireAdmin();
  const { t } = await getDict();
  const w = t.admin.web;
  const page = sitePage(slug);
  if (!page || !isLocale(locale)) return { error: w.errors.unknownPage };

  const blocks: readonly TextBlock[] = page.blocks;
  const latest = await latestVersions(blocks.map((b) => b.key), locale);
  const current = (b: TextBlock) => latest.get(b.key)?.body ?? b.defaults[locale];
  /** Who saved the block since the editor was opened, or null when nobody did */
  const changedMeanwhile = (b: TextBlock) => {
    const v = latest.get(b.key);
    return (v?.id ?? 0) !== Number(formData.get(`rev:${b.key}`) ?? 0) ? (v?.author ?? w.deletedAccount) : null;
  };
  const conflict = (b: TextBlock, who: string): SiteTextsState => ({ error: w.errors.conflict(w.blocks[b.key].label, who) });

  const intent = String(formData.get("intent") ?? "save");
  const changes: { block: TextBlock; body: string | null }[] = [];

  if (intent.startsWith("default:") || intent.startsWith("restore:")) {
    let block: TextBlock | undefined;
    let body: string | null = null;
    if (intent.startsWith("default:")) {
      block = blocks.find((b) => b.key === intent.slice("default:".length));
    } else {
      const id = Number(intent.slice("restore:".length));
      const [version] = Number.isSafeInteger(id)
        ? await db
            .select({ key: siteTexts.key, body: siteTexts.body })
            .from(siteTexts)
            .where(and(eq(siteTexts.id, id), eq(siteTexts.locale, locale), inArray(siteTexts.key, blocks.map((b) => b.key))))
        : [];
      block = version && blocks.find((b) => b.key === version.key);
      body = version?.body ?? null;
    }
    if (!block) return { error: w.errors.unknownPage };
    const who = changedMeanwhile(block);
    if (who) return conflict(block, who);
    if ((latest.get(block.key)?.body ?? null) !== body) changes.push({ block, body });
  } else {
    const fieldErrors: Record<string, string[]> = {};
    for (const block of blocks) {
      const raw = formData.get(`body:${block.key}`);
      if (typeof raw !== "string") continue;
      // one-line texts stay on one line; formatted ones keep their line breaks, in one style
      const text = block.kind === "line" ? raw.replace(/\s+/g, " ").trim() : raw.replace(/\r\n?/g, "\n").trim();
      if (text.length > MAX_TEXT_LENGTH[block.kind]) {
        fieldErrors[block.key] = [w.errors.tooLong(MAX_TEXT_LENGTH[block.kind])];
        continue;
      }
      if (text === current(block).trim()) continue;
      const who = changedMeanwhile(block);
      if (who) return conflict(block, who);
      // the same as the text in the code: store "back to default", so a later change of the default shows too
      changes.push({ block, body: text === block.defaults[locale].trim() ? null : text });
    }
    if (Object.keys(fieldErrors).length) return { error: w.errors.fix, fieldErrors };
  }

  if (changes.length === 0) return { ok: true, message: w.nothingChanged };
  await db.insert(siteTexts).values(
    changes.map(({ block, body }) => ({ key: block.key, locale, body, createdBy: me.id })),
  );
  await logAction(me, "web.texts", {
    page: slug,
    locale,
    blocks: changes.map((c) => c.block.key),
    intent: intent === "save" ? "save" : intent.startsWith("default:") ? "default" : "restore",
  });
  revalidatePath(page.path);
  revalidatePath("/admin/web", "layout");
  return { ok: true, message: intent === "save" ? w.saved : w.restored };
}
