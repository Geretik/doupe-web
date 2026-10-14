import type { Metadata } from "next";
import { getDict } from "@/i18n/server";
import { scriptToolUrl } from "@/lib/site";
import { SourcesContent } from "./content";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: `${t.sources.title} – ${t.meta.title}`, description: t.sources.subtitle };
}

/** Where the characters, their texts and icons come from: the official ones, the homebrew collections with their authors */
export default async function SourcesPage() {
  const { locale, t } = await getDict();
  return (
    <article className="max-w-2xl">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.sources.title}</h1>
      <p className="mt-2 text-muted">{t.sources.subtitle}</p>

      <div className="mt-8">
        <SourcesContent locale={locale} scriptTool={scriptToolUrl()} />
      </div>
    </article>
  );
}
