import { Alert } from "@/components/ui";
import type { Dict, Locale } from "@/i18n/dictionaries";
import { dailyJobsHealth } from "@/lib/job-runs";
import { contactEmail } from "@/lib/site";
import { formatShortDate, formatTime } from "@/lib/time";

/** Missing configuration that silently breaks things (e.g. no CRON_SECRET = no reminders, no data deletion). */
export async function SetupWarnings({ t, locale }: { t: Dict; locale: Locale }) {
  const h = t.admin.health;
  const cron = await dailyJobsHealth();
  const items: React.ReactNode[] = [];
  if (!cron.ok) {
    items.push(
      cron.reason === "no_secret" ? (
        h.cronNoSecret
      ) : (
        <>
          {cron.reason === "never" ? h.cronNever : h.cronStale(`${formatShortDate(cron.last, locale)} ${formatTime(cron.last, locale)}`)}{" "}
          {/* the cron route also accepts a signed-in organiser */}
          <a href="/api/cron/reminders" target="_blank" className="font-medium underline">{h.runNow}</a>
        </>
      ),
    );
  }
  if (!contactEmail()) items.push(h.contactMissing);
  if (items.length === 0) return null;
  return (
    <Alert kind="error">
      <p className="font-semibold">{h.title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </Alert>
  );
}
