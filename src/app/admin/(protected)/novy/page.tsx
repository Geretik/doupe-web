import { createSessionAction } from "@/app/actions/admin";
import { SessionForm } from "@/components/admin/session-form";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { discordConfigured } from "@/lib/discord";
import { getSessionWithCount } from "@/lib/queries";
import { dateToPragueLocal } from "@/lib/time";

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const fromId = Number(from);
  const [{ t }, template] = await Promise.all([
    getDict(),
    from && Number.isInteger(fromId) ? getSessionWithCount(fromId) : null,
  ]);
  // duplicated session: same details, one week later
  const week = 7 * 864e5;
  const defaults = template
    ? {
        startsAt: dateToPragueLocal(new Date(template.startsAt.getTime() + week)),
        endsAt: dateToPragueLocal(new Date(template.endsAt.getTime() + week)),
      }
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t.admin.create.title}</h1>
      {template && <p className="text-sm text-muted">{t.admin.create.prefilled(template.title)}</p>}
      <Card>
        <SessionForm
          action={createSessionAction}
          mode="create"
          session={template ?? undefined}
          defaults={defaults}
          discordConfigured={discordConfigured()}
          t={t.admin.form}
        />
      </Card>
    </div>
  );
}
