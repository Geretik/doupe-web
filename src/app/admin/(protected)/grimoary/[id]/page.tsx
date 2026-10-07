import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Grimoire } from "@/components/grimoire/grimoire";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { grimoireCharacters } from "@/lib/grimoire/characters";
import { canEditGrimoire, canViewGrimoire, getGrimoire, grimoireScripts } from "@/lib/grimoire/service";
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
  const [{ locale, t }, scripts] = await Promise.all([getDict(), grimoireScripts()]);
  const g = row.grimoire;
  return (
    <Grimoire
      id={g.id}
      name={g.name}
      initial={{ state: g.state, version: g.version }}
      canEdit={canEditGrimoire(me, g)}
      characters={grimoireCharacters(locale)}
      scripts={scripts}
      session={g.sessionId && row.sessionTitle ? { id: g.sessionId, title: row.sessionTitle } : null}
      recorded={g.gameId !== null}
      locale={locale}
      t={t.grimoire}
    />
  );
}
