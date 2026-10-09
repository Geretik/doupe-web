import type { PresenceSlot } from "@/modules/botc/lib/presence";

/** Grid lines: clean steps below the top (everyone signed up), none so close to it that the labels touch. */
function ticks(total: number) {
  const step = [1, 2, 5, 10, 20, 50].find((s) => total / s <= 4) ?? 100;
  const below: number[] = [];
  for (let v = step; v < total; v += step) if (total - v >= total * 0.15) below.push(v);
  return [0, ...below, total];
}

/**
 * Column per half hour: how many of the signed-up players are expected there. The top of the plot is everyone; a
 * tap or hover on a column shows its count, the highest column has it on its cap. No names: the table has them.
 */
export function PresenceChart({ slots, total, t }: { slots: PresenceSlot[]; total: number; t: { of: (count: number, total: number) => string } }) {
  const max = Math.max(total, 1);
  const peak = slots.reduce((best, s, i) => (s.count > slots[best].count ? i : best), 0);
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <figure className="flex flex-col gap-1 pt-2 text-xs" data-testid="presence">
      <div className="flex gap-2">
        {/* y axis: the values the columns are not labelled with */}
        <div className="relative h-40 w-6 shrink-0 tabular-nums text-muted" aria-hidden>
          {ticks(total).map((v) => (
            <span key={v} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: pct(v) }}>
              {v}
            </span>
          ))}
        </div>
        <div className="relative h-40 flex-1">
          {ticks(total).map((v) => (
            <span key={v} className="absolute inset-x-0 border-t border-border" style={{ bottom: pct(v) }} aria-hidden />
          ))}
          <ol className="relative flex h-full">
            {slots.map((s, i) => {
              // the tooltip stays inside the plot at both ends
              const align = i < slots.length / 3 ? "left-0" : i >= (slots.length * 2) / 3 ? "right-0" : "left-1/2 -translate-x-1/2";
              const label = `${s.from}–${s.to}: ${t.of(s.count, total)}`;
              return (
                <li
                  key={s.from}
                  tabIndex={0}
                  aria-label={label}
                  className="group relative flex h-full min-w-0 flex-1 items-end justify-center px-px outline-none"
                  data-count={s.count}
                >
                  <span
                    className="relative block w-full max-w-6 rounded-t bg-accent transition-opacity group-hover:opacity-75 group-focus:opacity-75"
                    style={{ height: pct(s.count) }}
                  >
                    {i === peak && s.count > 0 && (
                      <span className="absolute inset-x-0 bottom-full mb-0.5 text-center font-semibold text-foreground">{s.count}</span>
                    )}
                  </span>
                  <span
                    role="tooltip"
                    className={`pointer-events-none absolute top-0 z-10 hidden whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 shadow-sm group-hover:block group-focus:block ${align}`}
                  >
                    <strong className="text-foreground">{t.of(s.count, total)}</strong>
                    <span className="ml-1 text-muted">
                      {s.from}–{s.to}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      {/* x axis: full hours (and an odd start), half hours are the columns between */}
      <div className="flex gap-2 tabular-nums text-muted" aria-hidden>
        <span className="w-6 shrink-0" />
        <div className="flex flex-1">
          {slots.map((s, i) => (
            // a flex box centres a label wider than its column over both its sides
            <span key={s.from} className="flex min-w-0 flex-1 justify-center whitespace-nowrap">
              {(i === 0 || s.from.endsWith(":00")) && s.from}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}
