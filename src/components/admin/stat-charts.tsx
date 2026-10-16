import type { ReactNode } from "react";
import type { Locale } from "@/i18n/dictionaries";
import { dayDate } from "@/lib/attendance";
import { formatShortDate } from "@/lib/time";
import { Card } from "../ui";

/*
 * Plain charts of the admin's statistics, without a library: one series in the accent colour, thin bars with a
 * rounded end, values on the bars or in a tooltip on hover and keyboard focus. Server components, no script.
 */

/** A round top of the scale above `v`: 1, 2, 4, 5, 10, 20, 25, 40, 50, 100… */
function niceMax(v: number) {
  for (let e = 1; ; e *= 10) for (const k of [1, 2, 2.5, 4, 5]) if (k * e >= v && Number.isInteger(k * e)) return k * e;
}

/** One number with its label; `note` under it in small print. */
export function StatTile({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-2xl font-bold">{value}</span>
      {note && <span className="text-xs text-muted">{note}</span>}
    </Card>
  );
}

export type Column = {
  key: string;
  value: number;
  /** In the tooltip after the value: "14. 10.", "18:30" */
  label: string;
  /** Under the axis, on some columns only: "říj", "18:00" */
  tick?: string;
};

/** Every how many columns keep their tick, so that at most `most` of `count` are shown */
export const everyNth = (count: number, most: number) => Math.max(1, Math.ceil(count / most));

/** "říj" / "říjen 2025" of a "YYYY-MM" */
export function monthName(m: string, locale: Locale, style: "short" | "long") {
  return new Intl.DateTimeFormat(locale, { month: style, ...(style === "long" && { year: "numeric" }), timeZone: "UTC" }).format(dayDate(`${m}-01`));
}

/** The club nights (newest first, as lib/attendance `listNights` gives them) as columns oldest first, a tick at the first night of a month */
export function nightColumns(nights: { day: string; total: number }[], locale: Locale): Column[] {
  const chronological = [...nights].reverse();
  const monthStarts = chronological.filter((n, i) => i === 0 || chronological[i - 1].day.slice(0, 7) !== n.day.slice(0, 7)).map((n) => n.day);
  const step = everyNth(monthStarts.length, 8);
  return chronological.map((n) => {
    const at = monthStarts.indexOf(n.day);
    return { key: n.day, value: n.total, label: formatShortDate(dayDate(n.day), locale), tick: at >= 0 && at % step === 0 ? monthName(n.day.slice(0, 7), locale, "short") : undefined };
  });
}

/** The narrowest a column may get when every column shows its value; narrower, the chart scrolls sideways */
const VALUE_COLUMN_REM = 1.25;

/**
 * Columns over time (nights, half hours, months), one series. The highest gets its value on the cap (with `values`
 * every one does), every one in a tooltip; `unit` words the value there ("12 lidí"). With `values` the columns keep
 * room for their numbers: when they do not fit, the chart scrolls sideways and opens at its end, the newest.
 */
export function ColumnChart({ data, unit, label, testId, values = false }: { data: Column[]; unit: (n: number) => string; label: string; testId?: string; values?: boolean }) {
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const top = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const ticks = max % 2 === 0 ? [max, max / 2, 0] : [max, 0];
  // room above for the value on the highest column; a scrolling box clips, so there also for the tooltips
  const room = values ? "pt-8" : "pt-4";
  const plot = (
    <div className="flex min-w-0 flex-1 flex-col gap-1" style={values ? { minWidth: `${data.length * VALUE_COLUMN_REM}rem` } : undefined}>
      <div className="relative h-40">
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-border" style={{ top: `${100 - (t / max) * 100}%` }} aria-hidden />
        ))}
        <ul className="relative flex h-full items-end gap-[2px]">
          {data.map((d, i) => (
            <li
              key={d.key}
              tabIndex={0}
              aria-label={`${d.label}: ${unit(d.value)}`}
              className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none"
            >
              {d.value > 0 && (
                <span
                  className="block w-full max-w-6 rounded-t bg-accent transition-opacity group-hover:opacity-75 group-focus-visible:opacity-75"
                  style={{ height: `${(d.value / max) * 100}%` }}
                />
              )}
              {(values || i === top) && d.value > 0 && (
                <span className="absolute left-1/2 -translate-x-1/2 -translate-y-full text-xs font-semibold tabular-nums" style={{ bottom: `${(d.value / max) * 100}%` }} aria-hidden>
                  {d.value}
                </span>
              )}
              <span
                role="tooltip"
                className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs shadow-sm group-hover:block group-focus-visible:block ${
                  i < data.length / 2 ? "left-0" : "right-0"
                }`}
              >
                <span className="font-semibold">{unit(d.value)}</span> <span className="text-muted">{d.label}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {/* the ticks under the columns they belong to */}
      <div className="flex gap-[2px] text-xs text-muted" aria-hidden>
        {data.map((d) => (
          <span key={d.key} className="relative h-4 min-w-0 flex-1">
            {d.tick && <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{d.tick}</span>}
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <figure className="flex gap-2" aria-label={label} data-testid={testId}>
      {/* the scale: round numbers, gridlines a hairline under the columns */}
      <div className={`${room} shrink-0`} aria-hidden>
        <div className="relative h-40 w-6 text-right text-xs tabular-nums text-muted">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / max) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
      </div>
      {/* row-reverse: a box that scrolls opens at its end */}
      <div className={values ? `${room} flex min-w-0 flex-1 flex-row-reverse overflow-x-auto` : `${room} flex min-w-0 flex-1`}>{plot}</div>
    </figure>
  );
}

export type Bar = { key: string; label: ReactNode; value: number; /** Beside the value: "(12 večerů)" */ note?: string };

/**
 * Horizontal bars, one series, each with its value at the tip. `stacked` puts a long label (a game's name) above its
 * bar instead of beside it.
 */
export function BarList({ data, format = String, stacked = false, testId }: { data: Bar[]; format?: (n: number) => string; stacked?: boolean; testId?: string }) {
  const max = Math.max(0, ...data.map((d) => d.value)) || 1;
  // room for the value (and the note) beside the longest bar; the same for every bar, so they compare
  const room = data.some((d) => d.note) ? "9rem" : "4rem";
  const bar = (d: Bar) => (
    <span className="flex min-w-0 items-center gap-2">
      {d.value > 0 && <span className="block h-4 shrink-0 rounded-r bg-accent" style={{ width: `calc((100% - ${room}) * ${d.value / max})` }} />}
      <span className="shrink-0 text-sm tabular-nums">
        <span className="font-semibold">{format(d.value)}</span>
        {d.note && <span className="ml-1 text-xs text-muted">{d.note}</span>}
      </span>
    </span>
  );
  return stacked ? (
    <ol className="flex flex-col gap-2" data-testid={testId}>
      {data.map((d) => (
        <li key={d.key} className="flex flex-col gap-0.5">
          <span className="text-sm">{d.label}</span>
          {bar(d)}
        </li>
      ))}
    </ol>
  ) : (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-3 gap-y-2" data-testid={testId}>
      {data.map((d) => (
        <div key={d.key} className="contents">
          <dt className="text-sm">{d.label}</dt>
          <dd>{bar(d)}</dd>
        </div>
      ))}
    </dl>
  );
}
