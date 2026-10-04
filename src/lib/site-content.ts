import { and, desc, eq, inArray } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { adminUsers, siteTexts } from "@/db/schema";
import type { Locale } from "@/i18n/dictionaries";
import { SITE_PAGES, sitePage, type PageTextKey, type SitePage, type SitePageSlug } from "./site-content-defaults";

/** One saved version of a block; body null = back to the text in the code. */
export type TextVersion = { id: number; key: string; body: string | null; createdAt: Date; author: string | null };

/** How many earlier versions of a block the admin offers to bring back */
export const HISTORY_LIMIT = 15;

const keysOf = (page: SitePage) => page.blocks.map((b) => b.key as string);

/** The newest version of each block of `keys` in `locale` (blocks never saved are missing). */
export async function latestVersions(keys: string[], locale: Locale): Promise<Map<string, TextVersion>> {
  const rows = await db
    .selectDistinctOn([siteTexts.key], {
      id: siteTexts.id,
      key: siteTexts.key,
      body: siteTexts.body,
      createdAt: siteTexts.createdAt,
      author: adminUsers.nickname,
    })
    .from(siteTexts)
    .leftJoin(adminUsers, eq(adminUsers.id, siteTexts.createdBy))
    .where(and(inArray(siteTexts.key, keys), eq(siteTexts.locale, locale)))
    .orderBy(siteTexts.key, desc(siteTexts.id));
  return new Map(rows.map((r) => [r.key, r]));
}

/**
 * The texts of a page as visitors see them: the newest saved version of each block, else the text from the
 * code. Without the database the page still shows the texts from the code. Looked up once per request
 * (metadata and page both ask).
 */
export const getPageTexts = cache(
  async <S extends SitePageSlug>(slug: S, locale: Locale): Promise<Record<PageTextKey<S>, string>> => {
    const page = sitePage(slug)!;
    const texts: Record<string, string> = Object.fromEntries(page.blocks.map((b) => [b.key, b.defaults[locale]]));
    try {
      for (const v of (await latestVersions(keysOf(page), locale)).values()) {
        if (v.body !== null) texts[v.key] = v.body;
      }
    } catch (err) {
      console.error("Site texts could not be read, showing the defaults:", err);
    }
    return texts as Record<PageTextKey<S>, string>;
  },
);

/** Every saved version of the page's blocks in `locale`, newest first, at most HISTORY_LIMIT + 1 per block. */
export async function getTextHistory(page: SitePage, locale: Locale): Promise<Map<string, TextVersion[]>> {
  const rows = await db
    .select({
      id: siteTexts.id,
      key: siteTexts.key,
      body: siteTexts.body,
      createdAt: siteTexts.createdAt,
      author: adminUsers.nickname,
    })
    .from(siteTexts)
    .leftJoin(adminUsers, eq(adminUsers.id, siteTexts.createdBy))
    .where(and(inArray(siteTexts.key, keysOf(page)), eq(siteTexts.locale, locale)))
    .orderBy(desc(siteTexts.id));
  const history = new Map<string, TextVersion[]>();
  for (const r of rows) {
    const list = history.get(r.key) ?? [];
    if (list.length <= HISTORY_LIMIT) list.push(r);
    history.set(r.key, list);
  }
  return history;
}

/** The newest change of each page in any language, for the admin's list of pages. */
export async function lastPageEdits(): Promise<Map<SitePageSlug, TextVersion>> {
  const rows = await db
    .selectDistinctOn([siteTexts.key], {
      id: siteTexts.id,
      key: siteTexts.key,
      body: siteTexts.body,
      createdAt: siteTexts.createdAt,
      author: adminUsers.nickname,
    })
    .from(siteTexts)
    .leftJoin(adminUsers, eq(adminUsers.id, siteTexts.createdBy))
    .orderBy(siteTexts.key, desc(siteTexts.id));
  const edits = new Map<SitePageSlug, TextVersion>();
  for (const page of SITE_PAGES) {
    const newest = rows.filter((r) => keysOf(page).includes(r.key)).sort((a, b) => b.id - a.id)[0];
    if (newest) edits.set(page.slug, newest);
  }
  return edits;
}
