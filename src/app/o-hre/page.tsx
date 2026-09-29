import type { Metadata } from "next";
import Link from "next/link";
import { H2, Ul } from "@/components/prose";
import { getDict } from "@/i18n/server";
import { AboutContent } from "./content";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: `${t.about.title} – ${t.meta.title}`, description: t.about.subtitle };
}

export default async function AboutPage() {
  const { locale, t } = await getDict();
  return (
    <article className="max-w-2xl">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.about.title}</h1>
      <p className="mt-2 text-muted">{t.about.subtitle}</p>

      <div className="mt-8">
        <AboutContent locale={locale} />
      </div>

      <H2>{t.about.links}</H2>
      <Ul>
        <li>
          <a href="https://botc-central.web.app/krvava-hodina" target="_blank" rel="noreferrer" className="underline hover:text-accent">
            {t.about.linkCentral}
          </a>
        </li>
        <li>
          <a href="https://www.zatrolene-hry.cz/spolecenska-hra/krvava-hodina-odbila-12158/" target="_blank" rel="noreferrer" className="underline hover:text-accent">
            {t.about.linkZatrolene}
          </a>
        </li>
        <li>
          <a href="https://bloodontheclocktower.com/" target="_blank" rel="noreferrer" className="underline hover:text-accent">
            bloodontheclocktower.com
          </a>
        </li>
      </Ul>

      <div className="mt-10">
        <Link
          href="/"
          className="inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          {t.about.toSessions}
        </Link>
      </div>
    </article>
  );
}
