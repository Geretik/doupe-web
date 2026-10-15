import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { KeyCardTool } from "@/modules/codenames/components/key-card-tool";

/**
 * Admin → Krycí jména: the spymasters' key card on a phone, to try the gold modes (Big Mines, Ultimate Mirrors), the set
 * on A4 pages to print (as the print tool mines-generator does) and how the modes are played. No data of anyone, so
 * every account has it.
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
      <section className="flex max-w-3xl flex-col gap-4 border-t border-border pt-6" data-testid="codenames-rules">
        <h2 className="text-lg font-semibold">{c.rules.title}</h2>
        {c.rules.sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-2">
            <h3 className="font-semibold">{section.title}</h3>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
