import { formatTime } from "@/lib/time";

export type PresenceSlot = {
  /** "HH:MM" in Prague */
  from: string;
  to: string;
  /** Players present at any moment of the slot */
  count: number;
  nicknames: string[];
};

type Player = { nickname: string; arrivalTime: string | null; departureTime: string | null };

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => {
  const v = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};

/**
 * Splits the session into hourly slots (first/last may be shorter when the session does not
 * start or end on a full hour) and counts who is there in each one. Null arrival/departure
 * means "from the start" / "until the end". Sessions may cross midnight.
 */
export function presenceByHour(
  session: { startsAt: Date; endsAt: Date },
  players: Player[],
): PresenceSlot[] {
  const start = toMin(formatTime(session.startsAt));
  let end = toMin(formatTime(session.endsAt));
  if (end <= start) end += 1440;
  const norm = (hhmm: string) => {
    const v = toMin(hhmm);
    return v < start && end > 1440 ? v + 1440 : v;
  };
  const ranges = players.map((p) => ({
    nickname: p.nickname,
    a: p.arrivalTime ? norm(p.arrivalTime) : start,
    d: p.departureTime ? norm(p.departureTime) : end,
  }));

  const slots: PresenceSlot[] = [];
  let from = start;
  while (from < end) {
    const to = Math.min(end, (Math.floor(from / 60) + 1) * 60);
    const present = ranges.filter((r) => r.a < to && r.d > from);
    slots.push({ from: toHHMM(from), to: toHHMM(to), count: present.length, nicknames: present.map((r) => r.nickname) });
    from = to;
  }
  return slots;
}
