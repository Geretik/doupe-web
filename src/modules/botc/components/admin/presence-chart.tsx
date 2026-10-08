import type { PresenceSlot } from "@/modules/botc/lib/presence";

/** Bar per hour: how many signed-up players are there. */
export function PresenceChart({ slots, total, allLabel }: { slots: PresenceSlot[]; total: number; allLabel: string }) {
  const max = Math.max(total, 1);
  return (
    <ol className="flex flex-col gap-1 text-sm" data-testid="presence">
      {slots.map((s) => (
        <li key={s.from} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-3" title={s.nicknames.join(", ")}>
          <span className="whitespace-nowrap text-muted tabular-nums">{s.from}–{s.to}</span>
          <span className="h-4 overflow-hidden rounded bg-border/40">
            <span
              className={`block h-full rounded ${s.count === total ? "bg-accent" : "bg-accent/60"}`}
              style={{ width: `${(s.count / max) * 100}%` }}
            />
          </span>
          <span className="whitespace-nowrap text-right tabular-nums">
            <strong>{s.count}</strong>
            {s.count === total && total > 0 && <span className="ml-1 text-xs text-muted">({allLabel})</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
