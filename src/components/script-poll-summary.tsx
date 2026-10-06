import Link from "next/link";
import type { Dict } from "@/i18n/dictionaries";
import { plural } from "@/i18n/plural";
import { byVotes, type PollOption } from "@/lib/script-poll";

/** The script vote on the public session page: the offered scripts with their counts, no names. */
export function ScriptPollSummary({
  options,
  open,
  t,
  className = "",
}: {
  options: PollOption[];
  open: boolean;
  t: Dict["poll"];
  className?: string;
}) {
  if (!options.length) return null;
  return (
    <div className={`text-sm ${className}`} data-testid="script-poll">
      <p>
        <span aria-hidden className="mr-1.5">🗳️</span>
        <span className="text-muted">{open ? t.publicOpen : t.publicClosed}</span>
      </p>
      <ul className="mt-1 flex flex-col gap-0.5 border-l border-border pl-3 ml-1.5">
        {byVotes(options).map((o) => (
          <li key={o.name}>
            {o.url ? (
              <a href={o.url} target="_blank" rel="noreferrer" className="underline hover:text-accent">{o.name}</a>
            ) : (
              o.name
            )}
            <span className="text-muted"> · {plural(t.votes, o.voters.length)}</span>
          </li>
        ))}
      </ul>
      {open && (
        <p className="mt-1 ml-1.5 pl-3 text-xs text-muted">
          {t.howToVote}{" "}
          <Link href="/botc/moje-hry" className="underline hover:text-accent">{t.lostLink}</Link>
        </p>
      )}
    </div>
  );
}
