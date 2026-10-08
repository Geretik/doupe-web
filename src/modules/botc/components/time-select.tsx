import { inputClass } from "@/components/ui";

const STEP = 15;

export function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function toHHMM(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "HH:MM" slots every 15 minutes strictly inside the session (start and end themselves are the defaults). */
export function timeSlots(start: string, end: string) {
  const s = toMin(start);
  let e = toMin(end);
  if (e <= s) e += 1440; // session crosses midnight
  const out: string[] = [];
  for (let m = s + STEP; m < e; m += STEP) out.push(toHHMM(m));
  return out;
}

/**
 * Arrival / departure picker limited to the session's time range.
 * The empty option means "at the start" / "until the end" and is stored as null.
 */
export function TimeSelect({
  id,
  name,
  start,
  end,
  defaultValue,
  defaultLabel,
}: {
  id: string;
  name: string;
  /** session start/end as "HH:MM" in Prague time */
  start: string;
  end: string;
  /** currently stored "HH:MM" or null */
  defaultValue?: string | null;
  /** label of the empty option, e.g. "Od začátku (19:00)" */
  defaultLabel: string;
}) {
  const slots = timeSlots(start, end);
  // keep a legacy value that is no longer a slot (e.g. after the organiser moved the session) selectable
  const extra = defaultValue && !slots.includes(defaultValue) ? [defaultValue] : [];
  return (
    <select id={id} name={name} defaultValue={defaultValue ?? ""} className={inputClass}>
      <option value="">{defaultLabel}</option>
      {[...extra, ...slots].map((v) => (
        <option key={v} value={v}>{v}</option>
      ))}
    </select>
  );
}
