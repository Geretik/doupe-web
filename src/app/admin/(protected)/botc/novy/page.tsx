import { createSessionAction } from "@/modules/botc/actions/sessions";
import { SessionForm } from "@/modules/botc/components/admin/session-form";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { discordConfigured } from "@/lib/discord";
import { getFormSuggestions } from "@/modules/botc/lib/form-suggestions";
import { getLatestCreatedSession, getSessionWithCount } from "@/modules/botc/lib/queries";
import { effectiveRegistrationState } from "@/modules/botc/lib/registration-state";
import { addPragueDays, dateToPragueLocal } from "@/lib/time";
import { parseId } from "@/lib/validation";

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  await requireAdmin();
  const fromId = parseId((await searchParams).from);
  const [{ t }, template, latest, suggestions] = await Promise.all([
    getDict(),
    fromId ? getSessionWithCount(fromId) : null,
    getLatestCreatedSession(),
    getFormSuggestions(),
  ]);
  const now = new Date();
  // duplicated session: same details, one week later – an older one moves to the next same weekday from today
  let days = 7;
  while (template && addPragueDays(template.startsAt, days) < now) days += 7;
  // new session: no date yet, the times of the last session created
  const times = (d: Date) => `T${dateToPragueLocal(d).split("T")[1]}`;
  const defaults = template
    ? {
        startsAt: dateToPragueLocal(addPragueDays(template.startsAt, days)),
        endsAt: dateToPragueLocal(addPragueDays(template.endsAt, days)),
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
          suggestions={suggestions}
          discordConfigured={discordConfigured()}
          t={t.admin.form}
        />
      </Card>
    </div>
  );
}
