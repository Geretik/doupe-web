import { formatTime } from "@/lib/time";

export type PresenceSlot = {
  /** "HH:MM" in Prague */
  from: string;
  to: string;
  /** Players present at any moment of the slot */
  count: number;
};

type Player = { arrivalTime: string | null; departureTime: string | null };

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => {
  const v = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};

/**
 * The session's start and end in minutes of the day, and a time of the session ("HH:MM") the same way: past
 * midnight in a session that crosses it, more than 1440.
 */
function sessionClock(session: { startsAt: Date; endsAt: Date }) {
  const start = toMin(formatTime(session.startsAt));
  let end = toMin(formatTime(session.endsAt));
  if (end <= start) end += 1440;
  const norm = (hhmm: string) => {
    const v = toMin(hhmm);
    return v < start && end > 1440 ? v + 1440 : v;
  };
  return { start, end, norm };
}

/**
 * Splits the session into slots of `minutes` on the clock (the first and last may be shorter when the session does
 * not start or end on one) and counts who is there in each: 18:00–20:00 counts in 18:00, 18:30, 19:00 and 19:30.
 * Null arrival/departure means "from the start" / "until the end". Sessions may cross midnight.
 */
export function presenceBySlot(
  session: { startsAt: Date; endsAt: Date },
  players: Player[],
  minutes = 30,
): PresenceSlot[] {
  const { start, end, norm } = sessionClock(session);
  const ranges = players.map((p) => ({
    a: p.arrivalTime ? norm(p.arrivalTime) : start,
    d: p.departureTime ? norm(p.departureTime) : end,
  }));

  const slots: PresenceSlot[] = [];
  let from = start;
  while (from < end) {
    const to = Math.min(end, (Math.floor(from / minutes) + 1) * minutes);
    slots.push({ from: toHHMM(from), to: toHHMM(to), count: ranges.filter((r) => r.a < to && r.d > from).length });
    from = to;
  }
  return slots;
}

/**
 * The players in the order they come: by arrival time (none = from the start), or with "late" arrivals those
 * coming later last. Who comes at the same time stays in the order given (of signing up).
 */
export function byArrival<T extends Pick<Player, "arrivalTime"> & { arrivesLate: boolean }>(
  session: { startsAt: Date; endsAt: Date; arrivalMode: "times" | "late" },
  players: T[],
): T[] {
  if (session.arrivalMode === "late") return [...players].sort((a, b) => Number(a.arrivesLate) - Number(b.arrivesLate));
  const { start, norm } = sessionClock(session);
  const at = (p: T) => (p.arrivalTime ? norm(p.arrivalTime) : start);
  return [...players].sort((a, b) => at(a) - at(b));
}
