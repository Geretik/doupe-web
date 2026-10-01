import type { Metadata } from "next";
import { MyGamesForm } from "@/components/my-games-form";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: `${t.myGames.title} – ${t.meta.title}` };
}

export default async function MyGamesRequestPage() {
  const { t } = await getDict();
  const m = t.myGames;
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{m.title}</h1>
      <p className="text-muted">{m.intro}</p>
      <Card>
        <MyGamesForm t={{ email: m.email, submit: m.submit, submitting: m.submitting, sent: m.sent }} />
      </Card>
    </div>
  );
}
