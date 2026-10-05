import type { Locale } from "@/i18n/dictionaries";

export const TZ = "Europe/Prague";

const intlLocale: Record<Locale, string> = { cs: "cs-CZ", en: "en-GB" };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: Locale, opts: Intl.DateTimeFormatOptions) {
  const key = locale + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(intlLocale[locale], { timeZone: TZ, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

export function formatDate(d: Date, locale: Locale = "cs") {
  const s = fmt(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "5. září 2026" / "5 September 2026" – a date inside a sentence */
export function formatDay(d: Date, locale: Locale = "cs") {
  return fmt(locale, { day: "numeric", month: "long", year: "numeric" }).format(d);
}

/** "pá 9. 10." / "Fri 9 Oct" – for badges and inside sentences */
export function formatShortDate(d: Date, locale: Locale = "cs") {
  return fmt(locale, locale === "cs" ? { weekday: "short", day: "numeric", month: "numeric" } : { weekday: "short", day: "numeric", month: "short" }).format(d);
}

/** "3. 10. 2026 14:05" / "3 Oct 2026, 14:05" – when something was changed */
export function formatStamp(d: Date, locale: Locale = "cs") {
  return fmt(locale, { day: "numeric", month: locale === "cs" ? "numeric" : "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

export function formatTime(d: Date, locale: Locale = "cs") {
  return fmt(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

export function formatRange(start: Date, end: Date, locale: Locale = "cs") {
  return `${formatDate(start, locale)}, ${formatTime(start, locale)}–${formatTime(end, locale)}`;
}

/** Offset of Europe/Prague from UTC at a given instant, in minutes. */
function tzOffsetMinutes(at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return (asUtc - at.getTime()) / 60000;
}

/** Parses "YYYY-MM-DDTHH:mm" (value of <input type="datetime-local">) as Prague local time. */
export function pragueLocalToDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = tzOffsetMinutes(new Date(guess));
  const result = new Date(guess - offset * 60000);
  const offset2 = tzOffsetMinutes(result);
  if (offset2 !== offset) return new Date(guess - offset2 * 60000);
  return result;
}

/** Formats a Date as "YYYY-MM-DDTHH:mm" in Prague time for <input type="datetime-local">. */
export function dateToPragueLocal(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** The same Prague wall-clock time `days` days later: a weekly 18:00 stays 18:00 across a daylight-saving change. */
export function addPragueDays(d: Date, days: number): Date {
  const [date, time] = dateToPragueLocal(d).split("T");
  const [y, m, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, day + days)).toISOString().slice(0, 10);
  return pragueLocalToDate(`${shifted}T${time}`) ?? new Date(d.getTime() + days * 864e5);
}

/** Calendar days from `from` to `to` in Prague time: 0 = the same day, 1 = the next day. */
export function pragueDaysBetween(from: Date, to: Date) {
  const day = (d: Date) => {
    const [y, m, dd] = dateToPragueLocal(d).slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, dd) / 864e5;
  };
  return day(to) - day(from);
}

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
