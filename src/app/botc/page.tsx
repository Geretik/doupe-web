import type { Metadata } from "next";
import { EditPencil } from "@/components/edit-pencil";
import { SessionCard } from "@/components/session-card";
import { getDict } from "@/i18n/server";
import { isAdmin } from "@/lib/admin-auth";
import { feedIcsUrl } from "@/lib/ics";
import { listUpcomingSessions } from "@/lib/queries";
import { getPageTexts } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: `${t.nav.botc} – ${t.meta.title}`, description: t.home.description };
}

export default async function SessionsPage() {
  const [sessions, admin, { locale, t }] = await Promise.all([
    listUpcomingSessions(),
    isAdmin(),
    getDict(),
  ]);
  const texts = await getPageTexts("krvavka", locale);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl sm:text-3xl font-bold tracking-tight">
          {t.home.title}
          {admin && <EditPencil href={`/admin/web/krvavka?lang=${locale}`} title={t.home.editPencil} />}
        </h1>
        {texts["krvavka.intro"] && <p className="mt-2 text-muted">{texts["krvavka.intro"]}</p>}
      </div>
      {sessions.length === 0 ? (
        <p className="text-muted">{t.home.empty}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} admin={admin} locale={locale} t={t} />
          ))}
        </div>
      )}
      <p className="text-sm text-muted">
        <span aria-hidden className="mr-1.5">🗓️</span>
        {t.home.calendarFeed}
        <a href={feedIcsUrl()} className="underline hover:text-accent">{t.home.calendarFeedLink}</a>
        <span className="block text-xs">{t.home.calendarFeedHint}</span>
      </p>
    </div>
  );
}
