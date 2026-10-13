import type { Metadata } from "next";
import Link from "next/link";
import { EditPencil } from "@/components/edit-pencil";
import { Markdown } from "@/components/markdown";
import { getDict } from "@/i18n/server";
import { canEditArea } from "@/lib/admin-auth";
import { getPageTexts } from "@/lib/site-content";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getDict();
  const texts = await getPageTexts("faq", locale);
  return { title: `${t.faq.title} – ${t.meta.title}`, description: texts["faq.intro"] || t.meta.description };
}

/** Questions newcomers ask, a subpage of the club page; the questions are edited in the admin (Texty webu → Klub – Časté otázky). */
export default async function FaqPage() {
  const [{ locale, t }, admin] = await Promise.all([getDict(), canEditArea("club")]);
  const texts = await getPageTexts("faq", locale);
  return (
    <article className="max-w-2xl">
      <h1 className="flex flex-wrap items-center gap-3 text-2xl sm:text-3xl font-bold tracking-tight">
        {t.faq.title}
        {admin && <EditPencil href={`/admin/web/faq?lang=${locale}`} title={t.faq.editPencil} />}
      </h1>
      {texts["faq.intro"] && <p className="mt-2 text-muted">{texts["faq.intro"]}</p>}

      <Markdown text={texts["faq.body"]} questions className="mt-8" />

      <p className="mt-10 text-sm text-muted">
        {t.faq.more}
        <Link href="/#vzkaz" className="underline hover:text-accent">{t.faq.moreLink}</Link>.
      </p>
      <Link href="/" className="mt-4 inline-block text-sm text-muted hover:underline">{t.faq.back}</Link>
    </article>
  );
}
