import Link from "next/link";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { lastPageEdits } from "@/lib/site-content";
import { SITE_PAGES } from "@/lib/site-content-defaults";
import { formatStamp } from "@/lib/time";

/** Site texts: the public pages whose texts organisers edit, each with its last change. */
export default async function SiteTextsPage() {
  await requireAdmin();
  const [{ locale, t }, edits] = await Promise.all([getDict(), lastPageEdits()]);
  const w = t.admin.web;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{w.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{w.intro}</p>
      </div>
      <div className="flex flex-col gap-3">
        {SITE_PAGES.map((p) => {
          const edit = edits.get(p.slug);
          return (
            <Link key={p.slug} href={`/admin/web/${p.slug}`} className="block">
              <Card className="flex flex-col gap-1 hover:border-accent/50 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div>
                  <p className="font-semibold">
                    {w.pages[p.slug].title}
                    <span className="ml-2 text-sm font-normal text-muted">{p.path}</span>
                  </p>
                  <p className="text-sm text-muted">{w.pages[p.slug].description}</p>
                </div>
                <p className="shrink-0 text-xs text-muted">
                  {edit ? w.lastEdit(formatStamp(edit.createdAt, locale), edit.author ?? w.deletedAccount) : w.neverEdited}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
