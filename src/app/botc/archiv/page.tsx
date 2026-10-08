import type { Metadata } from "next";
import Link from "next/link";
import { EditPencil } from "@/components/edit-pencil";
import { GameCard } from "@/modules/botc/components/game-card";
import { findRole } from "@/modules/botc/lib/botc-roles";
import { ScriptLinks } from "@/modules/botc/components/script-links";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { isAdmin } from "@/lib/admin-auth";
import { gamesBySession, listPastSessions } from "@/modules/botc/lib/queries";
import { formatDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: `${t.archive.title} – ${t.meta.title}`, description: t.archive.subtitle };
}

export default async function ArchivePage() {
  const [sessions, admin, { locale, t }] = await Promise.all([listPastSessions(), isAdmin(), getDict()]);
  const played = await gamesBySession(sessions.map((s) => s.id));
  const anyIcon = [...played.values()].some((list) => list.some((g) => g.demonBluffs?.length || g.roster.some((p) => findRole(p.role))));
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.archive.title}</h1>
        <p className="mt-2 text-muted">{t.archive.subtitle}</p>
      </div>
      {sessions.length === 0 ? (
        <p className="text-muted">{t.archive.empty}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {sessions.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                    {s.title}
                    {admin && <EditPencil href={`/admin/termin/${s.id}#hry`} title={t.archive.editPencil} />}
                  </h2>
                  <span className="text-sm text-muted">{t.archive.players(s.confirmedCount)}</span>
                </div>
                <p className="text-sm">
                  <span aria-hidden className="mr-1.5">📅</span>
                  {formatDate(s.startsAt, locale)}
                  <span className="text-muted"> · </span>
                  <span aria-hidden className="mr-1.5">📍</span>
                  <span className="text-muted">{s.place}</span>
                </p>
                {s.storyteller && (
                  <p className="text-sm text-muted">
                    <span aria-hidden className="mr-1.5">🎩</span>
                    {t.session.storytellerLabel}: {s.storyteller}
                  </p>
                )}
                <ScriptLinks scripts={s.scripts} label={t.session.scripts(s.scripts.length)} />
                {(played.get(s.id)?.length ?? 0) > 0 && (
                  <ol className="mt-2 flex flex-col gap-3 text-sm">
                    {played.get(s.id)!.map((g, i) => (
                      <GameCard key={g.id} game={g} number={i + 1} locale={locale} t={t} />
                    ))}
                  </ol>
                )}
              </Card>
            </li>
          ))}
        </ol>
      )}
      {anyIcon && <p className="text-xs text-muted">{t.archive.iconsCredit}</p>}
      <Link href="/botc" className="text-sm text-muted hover:underline">{t.session.back}</Link>
    </div>
  );
}
