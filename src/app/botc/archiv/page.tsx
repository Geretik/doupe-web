import type { Metadata } from "next";
import Link from "next/link";
import { GameRoster } from "@/components/game-roster";
import { ScriptLinks } from "@/components/script-links";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { gamesBySession, listPastSessions } from "@/lib/queries";
import { formatDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: `${t.archive.title} – ${t.meta.title}`, description: t.archive.subtitle };
}

export default async function ArchivePage() {
  const [sessions, { locale, t }] = await Promise.all([listPastSessions(), getDict()]);
  const played = await gamesBySession(sessions.map((s) => s.id));
  const anyRoster = [...played.values()].some((list) => list.some((g) => g.roster.some((p) => p.role)));
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
                  <h2 className="text-lg font-semibold">{s.title}</h2>
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
                  <ul className="mt-1 flex flex-col gap-1.5 text-sm">
                    {played.get(s.id)!.map((g) => (
                      <li key={g.id} className="flex flex-col gap-1">
                        <span>
                          <span aria-hidden className="mr-1.5">🎲</span>
                          {g.scriptUrl ? <a href={g.scriptUrl} className="hover:underline" target="_blank" rel="noreferrer">{g.scriptName}</a> : g.scriptName}
                          {g.winner && <span className="text-muted"> · {g.winner === "good" ? "😇" : "😈"} {t.archive.winner[g.winner]}</span>}
                          {g.players && <span className="text-muted"> · {t.archive.gamePlayers(g.players)}</span>}
                        </span>
                        <GameRoster players={g.roster} locale={locale} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          ))}
        </ol>
      )}
      {anyRoster && <p className="text-xs text-muted">{t.archive.iconsCredit}</p>}
      <Link href="/botc" className="text-sm text-muted hover:underline">{t.session.back}</Link>
    </div>
  );
}
