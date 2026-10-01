import type { Session } from "@/db/schema";
import { siteName, siteUrl } from "./site";

/** RFC 5545 text escaping. */
function esc(s: string) {
  return s
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r?\n/g, "\\n");
}

/** 20301205T170000Z */
function utcStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Folds lines longer than 75 octets as the spec requires. */
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 73) {
      out.push(cur);
      cur = " " + ch;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.join("\r\n");
}

function host() {
  try {
    return new URL(siteUrl()).host;
  } catch {
    return "botc";
  }
}

export function sessionUrl(id: number) {
  return `${siteUrl()}/botc/termin/${id}`;
}

export function sessionIcsUrl(id: number) {
  return `${siteUrl()}/botc/termin/${id}/kalendar.ics`;
}

export function feedIcsUrl() {
  return `${siteUrl()}/kalendar.ics`;
}

export function sessionDescription(s: Session) {
  const parts = [`Blood on the Clocktower – ${s.title}`];
  if (s.storyteller) parts.push(`🎩 ${s.storyteller}`);
  if (s.note) parts.push(s.note);
  if (s.scripts.length) {
    parts.push(s.scripts.map((x) => `${x.name}: ${x.url}`).join("\n"));
  }
  parts.push(sessionUrl(s.id));
  return parts.join("\n\n");
}

function vevent(s: Session, now: Date, describe: (s: Session) => string) {
  return [
    "BEGIN:VEVENT",
    `UID:session-${s.id}@${host()}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(s.startsAt)}`,
    `DTEND:${utcStamp(s.endsAt)}`,
    `SUMMARY:${esc(`BotC: ${s.title}`)}`,
    `LOCATION:${esc(s.place)}`,
    `DESCRIPTION:${esc(describe(s))}`,
    `URL:${sessionUrl(s.id)}`,
    "END:VEVENT",
  ];
}

export function buildIcs(
  list: Session[],
  calendarName: string,
  now = new Date(),
  describe: (s: Session) => string = sessionDescription,
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${esc(siteName())}//Registrace//CS`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calendarName)}`,
    "X-WR-TIMEZONE:Europe/Prague",
    ...list.flatMap((s) => vevent(s, now, describe)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(s: Session) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `BotC: ${s.title}`,
    dates: `${utcStamp(s.startsAt)}/${utcStamp(s.endsAt)}`,
    details: sessionDescription(s),
    location: s.place,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
