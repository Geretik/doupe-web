import type { Metadata } from "next";
import Link from "next/link";
import { saveBuiltScriptAction } from "@/modules/botc/actions/scripts";
import { ScriptBuilder } from "@/modules/botc/components/admin/script-builder";
import { getDict } from "@/i18n/server";
import { requireAccess } from "@/lib/admin-auth";
import { homebrewAbilities } from "@/modules/botc/lib/homebrew";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: t.scripts.builderTitle };
}

/** A new library script built from characters picked on the site, official and homebrew. */
export default async function NewScriptPage() {
  const me = await requireAccess("botc", "edit");
  const { locale, t } = await getDict();
  const s = t.scripts;
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/botc/scripty" className="text-sm text-muted hover:underline">{s.back}</Link>
      <h1 className="text-2xl font-bold">{s.builderTitle}</h1>
      <p className="max-w-3xl text-sm text-muted">{s.builder.intro}</p>
      <ScriptBuilder
        action={saveBuiltScriptAction.bind(null, null)}
        initial={{ name: "", author: me.nickname, picked: [] }}
        abilities={homebrewAbilities(locale)}
        teamLabels={{ ...t.admin.session.roleTeams, ...t.grimoire.storytellerTeams }}
        locale={locale}
        t={s.builder}
      />
    </div>
  );
}
