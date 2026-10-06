import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { registrations, scriptVotes, type ScriptLink, type Session } from "@/db/schema";

type PollSession = Pick<Session, "scriptPoll" | "scriptPollClosedAt" | "startsAt">;

/** Players vote while the session offers scripts, has not started and no organiser ended the vote. */
export function scriptPollOpen(s: PollSession, now = new Date()) {
  return s.scriptPoll.length > 0 && !s.scriptPollClosedAt && s.startsAt > now;
}

export type PollOption = ScriptLink & {
  /** Nicknames of the players who voted for it – only for organisers, the players see the count */
  voters: string[];
};

/**
 * The poll's options in the organiser's order with their voters. Only signed-up and waitlisted players
 * count; a vote for a name that is no longer offered is left out.
 */
export async function scriptPollResults(session: Pick<Session, "id" | "scriptPoll">) {
  const votes = await db
    .select({ script: scriptVotes.script, registrationId: scriptVotes.registrationId, nickname: registrations.nickname })
    .from(scriptVotes)
    .innerJoin(registrations, eq(scriptVotes.registrationId, registrations.id))
    .where(and(eq(registrations.sessionId, session.id), inArray(registrations.status, ["confirmed", "waitlisted"])))
    .orderBy(asc(registrations.nickname));
  const options: PollOption[] = session.scriptPoll.map((o) => ({
    ...o,
    voters: votes.filter((v) => v.script === o.name).map((v) => v.nickname),
  }));
  const offered = new Set(session.scriptPoll.map((o) => o.name));
  const voters = new Set(votes.filter((v) => offered.has(v.script)).map((v) => v.registrationId)).size;
  return { options, voters };
}

/** Names of the options this registration voted for. */
export async function votesOf(registrationId: number) {
  const rows = await db
    .select({ script: scriptVotes.script })
    .from(scriptVotes)
    .where(eq(scriptVotes.registrationId, registrationId));
  return rows.map((r) => r.script);
}

/** Options with the most votes first; a tie keeps the organiser's order. */
export function byVotes(options: PollOption[]) {
  return [...options].sort((a, b) => b.voters.length - a.voters.length);
}
