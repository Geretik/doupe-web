import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { saveBuiltScriptAction } from "@/modules/botc/actions/scripts";
import { ScriptBuilder } from "@/modules/botc/components/admin/script-builder";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { homebrewAbilities } from "@/modules/botc/lib/homebrew";
import { canEditScript, getLibraryScript, knownCharactersOf } from "@/modules/botc/lib/scripts";
import { parseId } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { t } = await getDict();
  const id = parseId((await params).id);
  const row = id ? await getLibraryScript(id) : null;
  return { title: row ? t.scripts.builderEditTitle(row.script.name) : t.scripts.builderTitle };
}

/** The characters of a library script picked anew; for the one who added it and administrators. */
export default async function ScriptCharactersPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const id = parseId((await params).id);
  const row = id ? await getLibraryScript(id) : null;
  if (!row || !canEditScript(me, row.script)) notFound();
  const { locale, t } = await getDict();
  const s = t.scripts;
  const { script } = row;
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/admin/botc/scripty/${script.id}`} className="text-sm text-muted hover:underline">
        ← {script.name}
      </Link>
      <h1 className="text-2xl font-bold">{s.builderEditTitle(script.name)}</h1>
      <p className="max-w-3xl text-sm text-muted">{s.builder.editIntro}</p>
      <ScriptBuilder
        action={saveBuiltScriptAction.bind(null, script.id)}
        initial={{ name: script.name, author: script.author ?? "", picked: knownCharactersOf(script) }}
        abilities={homebrewAbilities(locale)}
        teamLabels={{ ...t.admin.session.roleTeams, ...t.grimoire.storytellerTeams }}
        locale={locale}
        t={s.builder}
      />
    </div>
  );
}
