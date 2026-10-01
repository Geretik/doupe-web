import { refreshGameCollectionAction } from "@/app/actions/admin";
import { Alert } from "@/components/ui";
import type { Dict, Locale } from "@/i18n/dictionaries";
import { gameCollectionProblem } from "@/lib/game-collection";
import { dailyJobsHealth } from "@/lib/job-runs";
import { contactEmail } from "@/lib/site";
import { formatShortDate, formatTime } from "@/lib/time";
import { ActionButton } from "./action-button";

/**
 * What silently breaks things: missing configuration (e.g. no CRON_SECRET = no reminders, no data deletion)
 * or a game list that Zatrolené hry no longer gives us.
 */
export async function SetupWarnings({ t, locale }: { t: Dict; locale: Locale }) {
  const h = t.admin.health;
  const [cron, games] = await Promise.all([dailyJobsHealth(), gameCollectionProblem()]);
  const when = (d: Date) => `${formatShortDate(d, locale)} ${formatTime(d, locale)}`;
  const items: React.ReactNode[] = [];
  if (!cron.ok) {
    items.push(
      cron.reason === "no_secret" ? (
        h.cronNoSecret
      ) : (
        <>
          {cron.reason === "never" ? h.cronNever : h.cronStale(when(cron.last))}{" "}
          {/* the cron route also accepts a signed-in organiser */}
          <a href="/api/cron/reminders" target="_blank" className="font-medium underline">{h.runNow}</a>
        </>
      ),
    );
  }
  if (!contactEmail()) items.push(h.contactMissing);
  if (games) {
    items.push(
      <>
        {h.gameCollection(games.error, games.loadedAt && when(games.loadedAt))}{" "}
        <ActionButton action={refreshGameCollectionAction} label={h.retry} pendingLabel={t.games.refreshing} />
      </>,
    );
  }
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
