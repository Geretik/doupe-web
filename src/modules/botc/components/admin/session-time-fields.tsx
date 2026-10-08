"use client";

import { useState, type MouseEvent } from "react";
import type { Dict } from "@/i18n/dictionaries";
import { Button, Field, inputClass } from "@/components/ui";
import { toHHMM, toMin } from "../time-select";

const STEP = 15;
const DAY = 1440;
const SLOTS = Array.from({ length: DAY / STEP }, (_, i) => toHHMM(i * STEP));

/** Opens the browser's calendar on a click anywhere in the field, not only on its small icon. */
function openPicker(e: MouseEvent<HTMLInputElement>) {
  try {
    e.currentTarget.showPicker();
  } catch {
    // unsupported browser – the field can still be typed into
  }
}

/** "YYYY-MM-DD" of the following day */
function nextDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Keeps a value that is not a 15-minute slot (older sessions) selectable */
function withValue(slots: string[], v: string) {
  return slots.includes(v) ? slots : [...slots, v].sort();
}

/**
 * Date from a calendar plus start and end times from 15-minute slots, so nothing has to be typed.
 * Submitted as the usual startsAt / endsAt datetime-local values; an end time before the start is the next day.
 */
export function SessionTimeFields({
  startsAt,
  endsAt,
  minDate,
  errors,
  t,
}: {
  /** "YYYY-MM-DDTHH:mm" in Prague time; the date part may be empty (new session: only the usual times) */
  startsAt?: string;
  endsAt?: string;
  /** "YYYY-MM-DD" – earliest date the calendar offers */
  minDate?: string;
  errors: { startsAt?: string[]; endsAt?: string[] };
  t: Dict["admin"]["form"];
}) {
  const [initialDate, initialStart] = (startsAt ?? "").split("T");
  const [date, setDate] = useState(initialDate ?? "");
  const [start, setStart] = useState(initialStart || "18:00");
  const [end, setEnd] = useState((endsAt ?? "").split("T")[1] || "22:00");

  const s = toMin(start);
  const offset = (v: string) => (toMin(v) - s + DAY) % DAY;
  // end options run from just after the start round the clock, so the usual choices come first
  const endSlots = withValue(SLOTS, end)
    .filter((v) => v !== start || v === end)
    .sort((a, b) => offset(a) - offset(b));
  const crossesMidnight = toMin(end) <= s;

  function changeStart(v: string) {
    // keep the length of the evening, like calendar apps do
    const length = offset(end) || 4 * 60;
    setStart(v);
    setEnd(toHHMM(toMin(v) + length));
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label={t.date} name="date" errors={errors.startsAt}>
        <input
          id="date"
          type="date"
          required
          min={minDate}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onClick={openPicker}
          className={inputClass}
        />
      </Field>
      <Field label={t.startsAt} name="startTime">
        <select id="startTime" value={start} onChange={(e) => changeStart(e.target.value)} className={inputClass}>
          {withValue(SLOTS, start).map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </Field>
      <Field label={t.endsAt} name="endTime" errors={errors.endsAt}>
        <select id="endTime" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass}>
          {endSlots.map((v) => (
            <option key={v} value={v}>
              {toMin(v) <= s ? `${v} (${t.nextDay})` : v}
            </option>
          ))}
        </select>
      </Field>
      <input type="hidden" name="startsAt" value={date ? `${date}T${start}` : ""} />
      <input type="hidden" name="endsAt" value={date ? `${crossesMidnight ? nextDay(date) : date}T${end}` : ""} />
    </div>
  );
}

/** The optional "open sign-ups automatically" moment: calendar date plus a 15-minute slot, with a button to clear it. */
export function OpensAtField({
  value,
  minDate,
  errors,
  t,
}: {
  /** "YYYY-MM-DDTHH:mm" in Prague time, or "" when none is set */
  value?: string;
  minDate?: string;
  errors?: string[];
  t: Dict["admin"]["form"];
}) {
  const [initialDate, initialTime] = (value ?? "").split("T");
  const [date, setDate] = useState(initialDate ?? "");
  const [time, setTime] = useState(initialTime || "18:00");
  return (
    <Field label={t.registrationOpensAt} name="opensAtDate" errors={errors} hint={t.registrationOpensAtHint}>
      <div className="flex flex-wrap gap-2">
        <input
          id="opensAtDate"
          type="date"
          min={minDate}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onClick={openPicker}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <select
          id="opensAtTime"
          aria-label={t.time}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className={inputClass}
        >
          {withValue(SLOTS, time).map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        {date && (
          <Button type="button" variant="secondary" onClick={() => setDate("")}>
            {t.clear}
          </Button>
        )}
      </div>
      <input type="hidden" name="registrationOpensAt" value={date ? `${date}T${time}` : ""} />
    </Field>
  );
}
