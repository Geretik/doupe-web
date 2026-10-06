import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { Card } from "@/components/ui";
import type { PageTextKey } from "@/lib/site-content-defaults";
import { CLUB_DISCORD_URL as DISCORD_URL } from "@/lib/site";

/** Highlighted box: Discord is our main channel and, for now, where club game nights are signed up for. */
function DiscordBox({
  title,
  button,
  note,
  children,
}: {
  title: string;
  button: string;
  note: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 flex flex-col items-start gap-3 rounded-xl border border-accent/40 bg-accent/5 p-5 first:mt-0">
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      {children}
      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noreferrer"
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
      >
        {button}
      </a>
      {note}
    </section>
  );
}

/**
 * The club page under its heading; the texts are edited in the admin (Texty webu → Klub). The link to
 * the game collection is not part of them, so it stays whatever the texts say.
 */
export function ClubContent({
  texts,
  discordButton,
  games,
}: {
  texts: Record<PageTextKey<"klub">, string>;
  discordButton: string;
  games: { lead: string; link: string };
}) {
  return (
    <>
      <Card>
        {texts["klub.info"].trim() && <Markdown text={texts["klub.info"]} className="[&_p]:mt-2" />}
        <p className="[&:not(:first-child)]:mt-2">
          <span aria-hidden className="mr-1.5">🎲</span>
          {games.lead}
          <Link href="/hry" className="underline hover:text-accent">{games.link}</Link>
        </p>
      </Card>

      <DiscordBox
        title={texts["klub.discordTitle"]}
        button={discordButton}
        note={<Markdown text={texts["klub.discordNote"]} className="text-sm text-muted" />}
      >
        <Markdown text={texts["klub.discordText"]} />
      </DiscordBox>

      <Markdown text={texts["klub.body"]} className="mt-10" />
    </>
  );
}
