import { createSessionAction } from "@/app/actions/admin";
import { SessionForm } from "@/components/admin/session-form";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { discordConfigured } from "@/lib/discord";
import { getLatestCreatedSession, getSessionWithCount } from "@/lib/queries";
import { effectiveRegistrationState } from "@/lib/registration-state";
import { dateToPragueLocal } from "@/lib/time";

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const fromId = Number(from);
  const [{ t }, template, latest] = await Promise.all([
    getDict(),
    from && Number.isInteger(fromId) ? getSessionWithCount(fromId) : null,
    getLatestCreatedSession(),
  ]);
  const now = new Date();
  // duplicated session: same details, one week later – an older one moves to the next same weekday from today
  const week = 7 * 864e5;
  let shift = week;
  while (template && template.startsAt.getTime() + shift < now.getTime()) shift += week;
  // new session: no date yet, the times of the last session created
  const times = (d: Date) => `T${dateToPragueLocal(d).split("T")[1]}`;
  const defaults = template
    ? {
        startsAt: dateToPragueLocal(new Date(template.startsAt.getTime() + shift)),
        endsAt: dateToPragueLocal(new Date(template.endsAt.getTime() + shift)),
        registrationState: effectiveRegistrationState(template),
      }
    : latest
      ? { startsAt: times(latest.startsAt), endsAt: times(latest.endsAt) }
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
          today={dateToPragueLocal(now).slice(0, 10)}
          discordConfigured={discordConfigured()}
          t={t.admin.form}
        />
      </Card>
    </div>
  );
}
