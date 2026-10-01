import Link from "next/link";
import { Alert, Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { verifyMyGamesToken } from "@/lib/my-games-token";
import { listRegistrationsByEmail } from "@/lib/queries";
import { editUrl } from "@/lib/site";
import { formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

/** The player's overview behind the magic link: upcoming sign-ups with edit links, past ones summarised. */
export default async function MyGamesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { locale, t } = await getDict();
  const m = t.myGames;
  const email = verifyMyGamesToken(token);
  if (!email) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{m.title}</h1>
        <Alert kind="error">{m.linkInvalid}</Alert>
        <Link href="/botc/moje-hry" className="text-sm underline">{m.submit}</Link>
      </div>
    );
  }
  const regs = await listRegistrationsByEmail(email);
  const now = new Date();
  const upcoming = regs
    .filter((r) => r.session.endsAt >= now && r.status !== "cancelled")
    .sort((a, b) => a.session.startsAt.getTime() - b.session.startsAt.getTime());
  const past = regs.filter((r) => r.session.endsAt < now && r.status === "confirmed");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{m.title}</h1>
        <p className="mt-1 text-sm text-muted">{email}</p>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{m.upcoming}</h2>
        {upcoming.length === 0 && (
          <p className="text-muted">{m.none}<Link href="/botc" className="underline">{m.browse}</Link>.</p>
        )}
        {upcoming.map((r) => (
          <Card key={r.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                <Link href={`/botc/termin/${r.session.id}`} className="hover:underline">{r.session.title}</Link>
              </p>
              <p className="text-sm text-muted">
                📅 {formatRange(r.session.startsAt, r.session.endsAt, locale)} · 📍 {r.session.place}
              </p>
              <p className="text-sm">{r.status === "waitlisted" ? "⏳" : "✅"} {m.status[r.status]}</p>
            </div>
            <a href={editUrl(r.editToken)} className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-accent">
              {m.edit}
            </a>
          </Card>
        ))}
      </section>
      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-muted">{m.past}</h2>
          <p className="text-sm text-muted">{m.pastCount(past.length)}</p>
          <ul className="text-sm text-muted">
            {past.slice(0, 20).map((r) => (
              <li key={r.id}>
                {formatRange(r.session.startsAt, r.session.endsAt, locale)} · {r.session.title}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
