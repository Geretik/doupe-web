"use client"; // error boundaries must be Client Components

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { CLUB_DISCORD_URL } from "@/lib/site";

// Inline instead of dictionaries.ts: this boundary is part of every page's client bundle,
// and it cannot receive the dictionary from the server.
const TEXT = {
  cs: {
    title: "Něco se pokazilo",
    body: "Stránku se teď nepodařilo načíst. Většinou stačí to za chvíli zkusit znovu. Když to nepomůže, napiš nám na Discord.",
    retry: "Zkusit znovu",
    home: "Na úvodní stránku",
    discord: "Discord klubu",
    code: "Kód chyby",
  },
  en: {
    title: "Something went wrong",
    body: "The page could not be loaded right now. Trying again in a moment usually helps. If it does not, write to us on Discord.",
    retry: "Try again",
    home: "Back to the home page",
    discord: "Club Discord",
    code: "Error code",
  },
};

const noSubscribe = () => () => {};

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // the root layout sets <html lang> from the language cookie
  const lang = useSyncExternalStore(noSubscribe, () => document.documentElement.lang, () => "cs");
  const t = lang === "en" ? TEXT.en : TEXT.cs;
  useEffect(() => console.error(error), [error]);
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p>{t.body}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => retry()}>{t.retry}</Button>
        <Link href="/" className="hover:underline">{t.home}</Link>
        <a href={CLUB_DISCORD_URL} className="hover:underline">{t.discord}</a>
      </div>
      {/* matches the server log entry on Vercel */}
      {error.digest && <p className="text-xs text-muted">{t.code}: {error.digest}</p>}
    </div>
  );
}
