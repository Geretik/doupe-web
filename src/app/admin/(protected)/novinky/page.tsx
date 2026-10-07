import Link from "next/link";
import { MarkNewsSeen } from "@/components/admin/mark-news-seen";
import { Card } from "@/components/ui";
import { changelog, changelogStamp, type ChangeAudience } from "@/data/changelog";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDay } from "@/lib/time";

const audienceClass: Record<ChangeAudience, string> = {
  players: "border-good/50 text-good",
  organizers: "border-accent/50 text-accent",
};

/** What changed on the site (data/changelog), newest first. */
export default async function NewsPage() {
  await requireAdmin();
  const { locale, t } = await getDict();
  const n = t.admin.news;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <MarkNewsSeen stamp={changelogStamp()} />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{n.title}</h1>
        <p className="text-sm text-muted">
          {n.intro} {n.czechOnly}
        </p>
      </div>
      {changelog.map((entry) => (
        <section key={entry.date} className="flex flex-col gap-2" data-testid="news-entry">
          <h2 className="flex flex-wrap items-baseline gap-x-3 text-lg font-semibold">
            <time dateTime={entry.date}>{formatDay(new Date(`${entry.date}T12:00:00Z`), locale)}</time>
            <span className="text-base font-normal text-muted">{entry.title}</span>
          </h2>
          <Card className="p-4">
            <ul className="flex flex-col gap-3">
              {entry.items.map((item) => (
                <li key={item.text} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className={`w-fit shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium sm:w-28 sm:text-center ${audienceClass[item.for]}`}>
                    {n.audience[item.for]}
                  </span>
                  <span className="text-sm">
                    {item.text}
                    {item.href && (
                      <>
                        {" "}
                        <Link href={item.href} className="whitespace-nowrap underline hover:text-accent">
                          {n.open}
                        </Link>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}
