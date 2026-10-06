import Link from "next/link";
import { Card } from "@/components/ui";
import { StatusBadge, YourTurnBadge } from "@/components/draft/view";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listDraftsFor, listMySessions } from "@/lib/draft/queries";

export default async function DraftsPage() {
  const me = await requireAdmin();
  const [{ t }, mine, drafts] = await Promise.all([getDict(), listMySessions(me.id), listDraftsFor(me)]);
  const d = t.draft;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">{d.mySessions}</h1>
        {mine.length === 0 && <p className="text-muted">{d.mySessionsNone}</p>}
        <ul className="flex flex-col gap-2" data-testid="my-sessions">
          {mine.map((s) => {
            const invited = s.memberStatus === "invited" && s.session.status === "preparing";
            const showPool = s.drafts && s.poolTarget > 0 && (s.session.status === "active" || s.session.status === "completed");
            return (
              <li key={s.session.id}>
                <Link href={`/admin/drafty/session/${s.session.id}`} className="block">
                  <Card className={`flex flex-col gap-1 hover:border-accent/50 sm:flex-row sm:items-center sm:justify-between ${s.myTurn ? "border-accent" : ""}`}>
                    <div className="flex flex-col gap-1">
                      <p className="font-semibold">
                        {s.draftName} – {s.session.name}
                      </p>
                      <p className="text-sm text-muted">{d.modes[s.session.mode].name}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {s.myTurn ? (
                        <YourTurnBadge t={t} />
                      ) : invited ? (
                        <span className="font-medium text-accent">{d.invitedBadge}</span>
                      ) : s.session.status === "active" && s.current ? (
                        <span className="text-muted">{d.waitingFor(s.current)}</span>
                      ) : (
                        <StatusBadge t={t} status={s.session.status} />
                      )}
                      {showPool && <span className="font-medium">{d.poolProgress(s.poolCount, s.poolTarget)}</span>}
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{d.draftsTitle}</h2>
          <Link href="/admin/drafty/novy" className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-accent">
            {d.newDraft}
          </Link>
        </div>
        <p className="text-sm text-muted">{d.intro}</p>
        {drafts.length === 0 && <p className="text-muted">{d.draftsNone}</p>}
        <ul className="flex flex-col gap-2">
          {drafts.map(({ draft, owner, sessions, active }) => (
            <li key={draft.id}>
              <Link href={`/admin/drafty/${draft.id}`} className="block">
                <Card className="flex flex-col gap-1 hover:border-accent/50 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{draft.name}</p>
                    {owner && <p className="text-sm text-muted">{d.owner(owner)}</p>}
                  </div>
                  <p className="text-sm">{d.sessionsCount(sessions, active)}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
