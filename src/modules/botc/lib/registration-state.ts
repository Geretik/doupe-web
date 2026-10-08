import type { RegistrationState } from "@/db/schema";

type WithState = { registrationState: RegistrationState; registrationOpensAt: Date | null };

/**
 * The state players see: closed sign-ups whose opening time has passed count as open. Evaluated on
 * every request, so they open on the minute without a cron (Vercel Hobby runs cron once a day).
 */
export function effectiveRegistrationState(s: WithState, now = new Date()): RegistrationState {
  return s.registrationState !== "open" && s.registrationOpensAt && s.registrationOpensAt <= now
    ? "open"
    : s.registrationState;
}

/** When closed sign-ups open on their own, or null. */
export function scheduledOpening(s: WithState, now = new Date()): Date | null {
  return s.registrationState !== "open" && s.registrationOpensAt && s.registrationOpensAt > now
    ? s.registrationOpensAt
    : null;
}
