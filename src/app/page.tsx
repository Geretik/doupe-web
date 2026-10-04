import type { Metadata } from "next";
import { EditPencil } from "@/components/edit-pencil";
import { getDict } from "@/i18n/server";
import { isAdmin } from "@/lib/admin-auth";
import { getPageTexts } from "@/lib/site-content";
import { ClubContent } from "./club-content";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getDict();
  const texts = await getPageTexts("klub", locale);
  return { title: t.club.title, description: texts["klub.intro"] || t.meta.description };
}

export default async function ClubPage() {
  const [{ locale, t }, admin] = await Promise.all([getDict(), isAdmin()]);
  const texts = await getPageTexts("klub", locale);
  return (
    <article className="max-w-2xl">
      <h1 className="flex flex-wrap items-center gap-3 text-2xl sm:text-3xl font-bold tracking-tight">
        {t.club.title}
        {admin && <EditPencil href={`/admin/web/klub?lang=${locale}`} title={t.club.editPencil} />}
      </h1>
      {texts["klub.intro"] && <p className="mt-2 text-muted">{texts["klub.intro"]}</p>}

      <div className="mt-8">
        <ClubContent texts={texts} discordButton={t.club.discordButton} />
      </div>
    </article>
  );
}
