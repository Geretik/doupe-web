import Link from "next/link";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { KeyCardPrint } from "@/modules/known-names/components/key-card-print";

/**
 * Admin → Známá jména → Tisk: the set of the key card on the phone on A4 pages, as the print tool mines-generator
 * prints it. Every account has it, as the key card.
 */
export default async function KnownNamesPrintPage() {
  await requireAdmin();
  const { locale, t } = await getDict();
  const c = t.admin.knownNames;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{c.print.title}</h1>
        <p className="max-w-3xl text-sm text-muted">{c.print.hint}</p>
        <Link href="/admin/znama-jmena" className="select-none self-start text-sm font-medium text-accent hover:underline">
          {c.print.toCards}
        </Link>
      </div>
      <KeyCardPrint t={c} lang={locale} />
    </div>
  );
}
