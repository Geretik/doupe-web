import type { Metadata } from "next";
import { getDict } from "@/i18n/server";
import { ClubContent } from "./club-content";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: t.club.title, description: t.club.subtitle };
}

export default async function ClubPage() {
  const { locale, t } = await getDict();
  return (
    <article className="max-w-2xl">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.club.title}</h1>
      <p className="mt-2 text-muted">{t.club.subtitle}</p>

      <div className="mt-8">
        <ClubContent locale={locale} />
      </div>
    </article>
  );
}
