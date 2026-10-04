import Link from "next/link";
import { notFound } from "next/navigation";
import { saveSiteTextsAction } from "@/app/actions/site-content";
import { SiteTextsForm, type SiteTextBlock } from "@/components/admin/site-texts-form";
import { Markdown } from "@/components/markdown";
import { locales, type Locale } from "@/i18n/dictionaries";
import { getDict, isLocale } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getTextHistory } from "@/lib/site-content";
import { sitePage } from "@/lib/site-content-defaults";
import { formatStamp } from "@/lib/time";

/** The texts of one public page in one language (?lang=en), with their history. */
export default async function SiteTextsEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  await requireAdmin();
  const page = sitePage((await params).slug);
  if (!page) notFound();
  const lang = (await searchParams).lang;
  const editLocale: Locale = isLocale(lang) ? lang : "cs";
  const [{ locale, t }, history] = await Promise.all([getDict(), getTextHistory(page, editLocale)]);
  const w = t.admin.web;

  const blocks: SiteTextBlock[] = page.blocks.map((b) => {
    const versions = history.get(b.key) ?? [];
    const latest = versions[0];
    const text = (body: string | null) => body ?? b.defaults[editLocale];
    const who = (author: string | null) => author ?? w.deletedAccount;
    return {
      key: b.key,
      kind: b.kind,
      label: w.blocks[b.key].label,
      hint: w.blocks[b.key].hint,
      value: text(latest?.body ?? null),
      rev: latest?.id ?? 0,
      custom: latest !== undefined && latest.body !== null,
      status: latest && latest.body !== null ? w.edited(formatStamp(latest.createdAt, locale), who(latest.author)) : w.original,
      history: versions.map((v, i) => ({
        id: v.id,
        current: i === 0,
        label: `${formatStamp(v.createdAt, locale)} · ${who(v.author)}${v.body === null ? ` · ${w.original}` : ""}`,
        preview: b.kind === "line" ? <p>{text(v.body)}</p> : <Markdown text={text(v.body)} />,
      })),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/web" className="text-sm text-muted hover:underline">← {w.title}</Link>
      <div className="flex flex-col gap-2">
        <h1 className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-2xl font-bold">
          {w.pages[page.slug].title}
          <a href={page.path} target="_blank" rel="noreferrer" className="text-sm font-normal text-accent hover:underline">
            {w.view} ↗
          </a>
        </h1>
        <p className="text-sm text-muted">{w.pages[page.slug].description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* plain links, not client-side navigation: leaving with unsaved changes asks first */}
        <div className="inline-flex overflow-hidden rounded-md border border-border text-sm">
          {locales.map((l) => (
            <a
              key={l}
              href={`?lang=${l}`}
              aria-current={l === editLocale ? "page" : undefined}
              className={`px-3 py-1.5 ${l === editLocale ? "bg-accent text-accent-foreground" : "bg-card hover:bg-border/40"}`}
            >
              {w.languages[l]}
            </a>
          ))}
        </div>
        <span className="text-xs text-muted">{w.languageHint}</span>
      </div>
      <SiteTextsForm
        // a different language is a different form: nothing typed in one carries over to the other
        key={editLocale}
        action={saveSiteTextsAction.bind(null, page.slug, editLocale)}
        blocks={blocks}
        t={w.form}
        editorStrings={w.editor}
      />
    </div>
  );
}
