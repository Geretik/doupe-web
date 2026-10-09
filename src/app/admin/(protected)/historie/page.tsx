import Link from "next/link";
import { LogEntryRow } from "@/components/admin/admin-log";
import { Button, inputClass } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { isLogArea, listAdminLog, LOG_RETENTION_DAYS, logAreas, type LogFilter } from "@/lib/admin-log";
import { listAdminUsers } from "@/lib/admin-users";
import { parseId } from "@/lib/validation";

type Params = { ucet?: string; oblast?: string; termin?: string; pred?: string };

/** The same page with these filters; empty ones are left out of the address. */
function href(params: Params) {
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
  return q.size ? `/admin/historie?${q}` : "/admin/historie";
}

/** What organisers did in the admin (lib/admin-log), newest first; administrators only. */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin("admin");
  const params = await searchParams;
  const filter: LogFilter = {
    userId: parseId(params.ucet ?? "") ?? undefined,
    area: isLogArea(params.oblast) ? params.oblast : undefined,
    sessionId: parseId(params.termin ?? "") ?? undefined,
    before: parseId(params.pred ?? "") ?? undefined,
  };
  const [{ locale, t }, users, log] = await Promise.all([getDict(), listAdminUsers(), listAdminLog(filter)]);
  const l = t.admin.log;
  const current: Params = { ucet: filter.userId?.toString(), oblast: filter.area, termin: filter.sessionId?.toString() };
  const ctx = { ...log, t: t.admin, locale };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{l.title}</h1>
        <p className="max-w-3xl text-sm text-muted">{l.intro(LOG_RETENTION_DAYS)}</p>
      </div>

      <form action="/admin/historie" className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="font-medium">{l.account}</span>
          <select name="ucet" defaultValue={current.ucet ?? ""} className={inputClass}>
            <option value="">{l.allAccounts}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nickname}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">{l.area}</span>
          <select name="oblast" defaultValue={current.oblast ?? ""} className={inputClass}>
            <option value="">{l.allAreas}</option>
            {logAreas.map((a) => (
              <option key={a} value={a}>
                {l.areas[a]}
              </option>
            ))}
          </select>
        </label>
        {current.termin && <input type="hidden" name="termin" value={current.termin} />}
        <Button type="submit" variant="secondary">
          {l.show}
        </Button>
        {current.termin && (
          <span className="flex items-center gap-2 self-center text-muted">
            {l.onlySession}
            <Link href={href({ ...current, termin: undefined })} className="underline hover:text-accent">
              {l.showAll}
            </Link>
          </span>
        )}
      </form>

      {log.entries.length === 0 ? (
        <p className="text-muted">{l.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                <th className="p-3">{l.when}</th>
                <th className="hidden p-3 sm:table-cell">{l.who}</th>
                <th className="p-3">{l.what}</th>
              </tr>
            </thead>
            <tbody>
              {log.entries.map((entry) => (
                <LogEntryRow key={entry.id} entry={entry} ctx={ctx} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(filter.before || log.olderThan) && (
        <nav className="flex justify-between text-sm">
          {filter.before ? (
            <Link href={href(current)} className="underline hover:text-accent">
              {l.newest}
            </Link>
          ) : (
            <span />
          )}
          {log.olderThan && (
            <Link href={href({ ...current, pred: String(log.olderThan) })} className="underline hover:text-accent" data-testid="log-older">
              {l.older}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
