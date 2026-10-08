import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Grimoire } from "@/modules/botc/components/grimoire/grimoire";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { grimoireCharacters } from "@/modules/botc/lib/grimoire/characters";
import { canDeleteGrimoire, canEditGrimoire, canViewGrimoire, getGrimoire, grimoireScripts, sessionPlayers } from "@/modules/botc/lib/grimoire/service";
import { parseId } from "@/lib/validation";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { t } = await getDict();
  const id = parseId((await params).id);
  const row = id ? await getGrimoire(id) : null;
  return { title: row ? `🧙 ${row.grimoire.name}` : t.grimoire.title };
}

export default async function GrimoirePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const id = parseId((await params).id);
  const row = id ? await getGrimoire(id) : null;
  if (!row || !canViewGrimoire(me, row.grimoire)) notFound();
  const g = row.grimoire;
  const { locale, t } = await getDict();
  const [scripts, players] = await Promise.all([grimoireScripts(), g.sessionId ? sessionPlayers(g.sessionId, locale) : []]);
  return (
    <Grimoire
      id={g.id}
      name={g.name}
      initial={{ state: g.state, version: g.version }}
      canEdit={canEditGrimoire(me, g)}
      canDelete={canDeleteGrimoire(me, g)}
      characters={grimoireCharacters(locale)}
      scripts={scripts}
      session={g.sessionId && row.sessionTitle ? { id: g.sessionId, title: row.sessionTitle } : null}
      sessionPlayers={players}
      recorded={g.gameId !== null}
      locale={locale}
      t={t.grimoire}
    />
  );
}
