import type { Metadata } from "next";
import { getDict } from "@/i18n/server";
import { contactEmail } from "@/lib/site";
import { PrivacyContent } from "./content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: `${t.privacy.title} – ${t.meta.title}`, description: t.privacy.subtitle };
}

export default async function PrivacyPage() {
  const { locale, t } = await getDict();
  return (
    <article className="max-w-2xl">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.privacy.title}</h1>
      <p className="mt-2 text-muted">{t.privacy.subtitle}</p>

      <div className="mt-8">
        <PrivacyContent
          locale={locale}
          contact={contactEmail()}
          discordAlerts={Boolean(process.env.DISCORD_ALERTS_WEBHOOK_URL)}
        />
      </div>
    </article>
  );
}
