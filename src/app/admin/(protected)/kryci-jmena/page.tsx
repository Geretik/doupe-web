import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { KeyCardTool } from "@/modules/codenames/components/key-card-tool";

/**
 * Admin → Krycí jména: the spymasters' key card on a phone, to try the gold modes (Big Mines, Ultimate Mirrors) before
 * the cards are printed with the print tool (mines-generator). No data of anyone, so every account has it.
 */
export default async function CodenamesPage() {
  await requireAdmin();
  const { locale, t } = await getDict();
  const c = t.admin.codenames;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{c.title}</h1>
        <p className="max-w-3xl text-sm text-muted">{c.intro}</p>
      </div>
      <KeyCardTool t={c} lang={locale} />
    </div>
  );
}
