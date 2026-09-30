import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { LanguageSwitch } from "@/components/language-switch";
import { getDict } from "@/i18n/server";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#8b1e2d" },
    { media: "(prefers-color-scheme: dark)", color: "#16120f" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getDict();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t.meta.title, template: `%s` },
    description: t.meta.description,
    openGraph: {
      siteName: t.meta.title,
      title: t.meta.title,
      description: t.meta.description,
      type: "website",
      locale: locale === "cs" ? "cs_CZ" : "en_GB",
    },
    twitter: { card: "summary_large_image" },
    appleWebApp: { capable: true, title: "DoUPě", statusBarStyle: "black-translucent" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getDict();
  return (
    <html lang={locale} className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border print:hidden">
          <div className="mx-auto max-w-3xl px-4 py-3 sm:py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/" className="mr-auto font-semibold tracking-tight text-lg leading-tight">
              🕰️ {t.meta.title}
            </Link>
            <LanguageSwitch locale={locale} t={t} className="order-2 sm:order-3" />
            <nav
              className="order-3 sm:order-2 -mx-2 flex basis-full sm:basis-auto sm:mx-0 items-center gap-1 sm:gap-4 overflow-x-auto whitespace-nowrap text-sm"
            >
              <Link href="/" className="rounded-md px-2 py-1.5 hover:underline">{t.nav.sessions}</Link>
              <Link href="/o-hre" className="rounded-md px-2 py-1.5 hover:underline">{t.nav.about}</Link>
              <Link href="/archiv" className="rounded-md px-2 py-1.5 hover:underline">{t.nav.archive}</Link>
              <Link href="/moje-hry" className="rounded-md px-2 py-1.5 hover:underline sm:hidden">{t.nav.myGames}</Link>
              <Link href="/klub" className="rounded-md px-2 py-1.5 hover:underline">{t.nav.club}</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8 flex-1">
          {children}
        </main>
        <footer className="border-t border-border print:hidden">
          <div className="mx-auto max-w-3xl px-4 py-4 text-sm text-muted flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{t.nav.footer}</span>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/moje-hry" className="hover:underline">{t.nav.myGames}</Link>
              <a href="/kalendar.ics" className="hover:underline">{t.nav.calendarFeed}</a>
              <Link href="/ochrana-udaju" className="hover:underline">{t.nav.privacy}</Link>
              <Link href="/admin" className="hover:underline">
                {t.nav.admin}
              </Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
