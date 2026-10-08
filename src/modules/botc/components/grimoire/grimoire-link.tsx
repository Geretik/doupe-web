import Link from "next/link";
import { Card } from "@/components/ui";
import type { Dict, Locale } from "@/i18n/dictionaries";
import type { GrimoireListItem } from "@/modules/botc/lib/grimoire/service";
import { fill } from "@/modules/botc/lib/grimoire/text";
import { formatStamp } from "@/lib/time";

/** One grimoire in a list (admin → Grimoáry, a session's games): name, phase, script, session. */
export function GrimoireLink({ item, t, locale, showOwner }: { item: GrimoireListItem; t: Dict; locale: Locale; showOwner?: boolean }) {
  const g = t.grimoire;
  const phase = item.phase === "night" || item.phase === "day" ? fill(g.phases[item.phase], { n: item.round }) : g.phases[item.phase];
  return (
    <Link href={`/admin/botc/grimoary/${item.id}`} className="block">
      <Card className="flex flex-col gap-1 py-3 hover:border-accent/50 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex flex-col">
          <span className="font-semibold">{item.name}</span>
          <span className="text-sm text-muted">
            {item.scriptName}
            {item.sessionTitle && <> · {item.sessionTitle}</>}
            {showOwner && <> · {fill(g.ownerLabel, { name: item.owner })}</>}
          </span>
        </span>
        <span className="flex items-center gap-3 text-sm">
          <span className={`rounded-full border px-2.5 py-0.5 font-medium ${item.endedAt ? "border-border text-muted" : "border-accent/50 text-accent"}`}>{phase}</span>
          <span className="text-muted">{formatStamp(item.updatedAt, locale)}</span>
        </span>
      </Card>
    </Link>
  );
}
