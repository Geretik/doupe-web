import Link from "next/link";
import { StatusBadge, YourTurnBadge } from "@/modules/botc/components/draft/view";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listDraftsFor } from "@/modules/botc/lib/draft/queries";

export default async function DraftsPage() {
  const me = await requireAdmin();
  const [{ t }, drafts] = await Promise.all([getDict(), listDraftsFor(me)]);
  const d = t.draft;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{d.title}</h1>
        <Link href="/admin/drafty/novy" className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-accent">
          {d.newDraft}
        </Link>
      </div>
      <p className="text-sm text-muted">{d.intro}</p>
      {drafts.length === 0 && <p className="text-muted">{d.none}</p>}
      <ul className="flex flex-col gap-2" data-testid="drafts">
        {drafts.map((x) => {
          const invited = x.memberStatus === "invited" && x.session.status === "preparing";
          const showPool = x.poolTarget > 0 && (x.session.status === "active" || x.session.status === "completed");
          return (
            <li key={x.draft.id}>
              <Link href={`/admin/drafty/${x.draft.id}`} className="block">
                <Card className={`flex flex-col gap-1 hover:border-accent/50 sm:flex-row sm:items-center sm:justify-between ${x.myTurn ? "border-2 border-accent shadow-md" : ""}`}>
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold">{x.draft.name}</p>
                    <p className="text-sm text-muted">
                      {d.modes[x.session.mode].name}
                      {x.owner && <> · {d.owner(x.owner)}</>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {x.myTurn ? (
                      <YourTurnBadge t={t} />
                    ) : invited ? (
                      <span className="font-medium text-accent">{d.invitedBadge}</span>
                    ) : x.session.status === "active" && x.current ? (
                      <span className="text-muted">{d.waitingFor(x.current)}</span>
                    ) : (
                      <StatusBadge t={t} status={x.session.status} />
                    )}
                    {showPool && <span className="font-medium">{d.poolProgress(x.poolCount, x.poolTarget)}</span>}
                  </div>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
