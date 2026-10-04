import type { Metadata } from "next";
import Link from "next/link";
import { EditPencil } from "@/components/edit-pencil";
import { Markdown } from "@/components/markdown";
import { getDict } from "@/i18n/server";
import { isAdmin } from "@/lib/admin-auth";
import { getPageTexts } from "@/lib/site-content";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getDict();
  const texts = await getPageTexts("o-hre", locale);
  return { title: `${t.about.title} – ${t.meta.title}`, description: texts["o-hre.intro"] || t.meta.description };
}

export default async function AboutPage() {
  const [{ locale, t }, admin] = await Promise.all([getDict(), isAdmin()]);
  const texts = await getPageTexts("o-hre", locale);
  return (
    <article className="max-w-2xl">
      <h1 className="flex flex-wrap items-center gap-3 text-2xl sm:text-3xl font-bold tracking-tight">
        {t.about.title}
        {admin && <EditPencil href={`/admin/web/o-hre?lang=${locale}`} title={t.about.editPencil} />}
      </h1>
      {texts["o-hre.intro"] && <p className="mt-2 text-muted">{texts["o-hre.intro"]}</p>}

      {/* the text is edited in the admin (Texty webu → O hře) */}
      <Markdown text={texts["o-hre.body"]} className="mt-8" />

      <div className="mt-10">
        <Link
          href="/botc"
          className="inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          {t.about.toSessions}
        </Link>
      </div>
    </article>
  );
}
