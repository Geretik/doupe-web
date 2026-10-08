import { createGrimoireAction } from "@/modules/botc/actions/grimoire";
import { SubmitButton } from "@/components/admin/submit-button";
import { DeleteGrimoireButton } from "@/modules/botc/components/grimoire/delete-grimoire";
import { GrimoireLink } from "@/modules/botc/components/grimoire/grimoire-link";
import { Alert, Card, Field, inputClass } from "@/components/ui";
import type { Dict, Locale } from "@/i18n/dictionaries";
import { getDict } from "@/i18n/server";
import { hasRole, requireAdmin } from "@/lib/admin-auth";
import { grimoireScripts, grimoireSessions, listGrimoires, type GrimoireListItem } from "@/modules/botc/lib/grimoire/service";
import { formatShortDate } from "@/lib/time";

export default async function GrimoiresPage({ searchParams }: { searchParams: Promise<{ nenalezeno?: string }> }) {
  const me = await requireAdmin();
  const [{ locale, t }, list, sessions, scripts, { nenalezeno }] = await Promise.all([
    getDict(),
    listGrimoires(me),
    grimoireSessions(),
    grimoireScripts(),
    searchParams,
  ]);
  const g = t.grimoire;
  const mine = list.filter((x) => x.ownerId === me.id);
  const others = list.filter((x) => x.ownerId !== me.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{g.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{g.intro}</p>
      </div>
      {nenalezeno && <Alert kind="error">{g.notFound}</Alert>}

      <Card className="max-w-2xl">
        <h2 className="mb-3 text-lg font-semibold">{g.newTitle}</h2>
        <form action={createGrimoireAction} className="flex flex-col gap-4">
          <Field label={g.session} name="sessionId" hint={g.sessionHint}>
            <select id="sessionId" name="sessionId" className={inputClass} defaultValue="">
              <option value="">{g.sessionNone}</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatShortDate(s.startsAt, locale)} · {s.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label={g.script} name="scriptId">
            <select id="scriptId" name="scriptId" className={inputClass} defaultValue="">
              <option value="">{g.scriptAuto}</option>
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={g.name} name="name" hint={g.nameHint}>
            <input id="name" name="name" maxLength={100} className={inputClass} />
          </Field>
          <SubmitButton>{g.create}</SubmitButton>
        </form>
      </Card>

      <GrimoireList title={g.mine} items={mine} t={t} locale={locale} canDelete={hasRole(me, "admin")} />
      {others.length > 0 && <GrimoireList title={g.others} items={others} t={t} locale={locale} canDelete={hasRole(me, "admin")} showOwner />}
    </div>
  );
}

function GrimoireList({
  title,
  items,
  t,
  locale,
  canDelete,
  showOwner,
}: {
  title: string;
  items: GrimoireListItem[];
  t: Dict;
  locale: Locale;
  /** An administrator's list: each grimoire with a delete button */
  canDelete: boolean;
  showOwner?: boolean;
}) {
  const g = t.grimoire;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {items.length === 0 && <p className="text-muted">{g.none}</p>}
      <ul className="flex flex-col gap-2" data-testid="grimoires">
        {items.map((x) => (
          <li key={x.id} className="flex items-stretch gap-2">
            <div className="min-w-0 flex-1">
              <GrimoireLink item={x} t={t} locale={locale} showOwner={showOwner} />
            </div>
            {canDelete && <DeleteGrimoireButton id={x.id} label={`${g.delete}: ${x.name}`} confirmText={g.deleteConfirm} compact />}
          </li>
        ))}
      </ul>
    </section>
  );
}
