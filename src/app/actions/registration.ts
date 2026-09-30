"use server";

import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { notifyOrganizers } from "@/lib/alerts";
import { siteUrl } from "@/lib/site";
import { formatRange } from "@/lib/time";
import { db } from "@/db";
import { registrations, sessions } from "@/db/schema";
import {
  sendConfirmationEmail,
  sendExistingRegistrationEmail,
  sendMyGamesLinkEmail,
  sendWaitlistEmail,
} from "@/lib/email";
import { generateEditToken } from "@/lib/token";
import {
  fieldErrorsOf,
  registrationEditSchema,
  registrationSchema,
  timeRangeErrors,
  type FormState,
} from "@/lib/validation";
import { getRegistrationByToken, listRegistrationsByEmail } from "@/lib/queries";
import { createMyGamesToken } from "@/lib/my-games-token";
import { promoteWaitlist } from "@/lib/waitlist";
import { getDict } from "@/i18n/server";

// Note: no revalidatePath() here on purpose. All public pages are force-dynamic,
// and revalidating would re-render the current page and replace the success
// message with the server state (e.g. "Termín je plný" for the last spot).

/** Minimum gap between two "you're already registered" e-mails for one registration. */
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

export type RegisterResult = FormState & {
  outcome?: "created" | "waitlisted" | "already_registered";
  /** 1-based position in the waitlist when outcome = "waitlisted" */
  position?: number;
  emailFailed?: boolean;
  /** true when the "already registered" mail was NOT re-sent because one went out recently */
  emailThrottled?: boolean;
};

/** Sign-ups allowed from one network per hour (bots, double posts). Raised for e2e via env. */
const RATE_LIMIT_PER_HOUR = Number(process.env.REGISTRATION_RATE_LIMIT ?? 10);

/** Salted hash of the caller's IP – enough to rate-limit, not enough to identify anyone later. */
async function clientIpHash() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0]?.trim();
  if (!ip) return null;
  return createHash("sha256").update(`${process.env.ADMIN_SECRET ?? ""}:${ip}`).digest("hex").slice(0, 32);
}

async function recentSignupsFrom(ipHash: string) {
  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(registrations)
    .where(and(eq(registrations.ipHash, ipHash), sql`${registrations.createdAt} > now() - interval '1 hour'`));
  return c;
}

async function trySend(fn: () => Promise<void>) {
  try {
    await fn();
    return false;
  } catch (e) {
    console.error("E-mail could not be sent", e);
    await notifyOrganizers(
      "E-mail hráči se nepodařilo odeslat",
      `Potvrzení registrace neodešlo: ${e instanceof Error ? e.message : String(e)}. Hráč o tom ví a má napsat organizátorům; v adminu je u něj ⚠️ a tlačítko ✉️ pro nové odeslání. Zkontroluj nastavení Resend (doména, EMAIL_FROM).`,
    );
    return true;
  }
}

export async function registerAction(
  sessionId: number,
  _prev: RegisterResult,
  formData: FormData,
): Promise<RegisterResult> {
  const { locale, t } = await getDict();
  const s = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!s) return { error: t.errors.notFound };
  const parsed = registrationSchema(t.errors, s).safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { error: t.errors.checkForm, fieldErrors: fieldErrorsOf(parsed.error) };
  }
  const data = parsed.data;
  if (data.website) {
    // honeypot hit – pretend success
    return { ok: true, outcome: "created" };
  }
  {
    const timeErrors = timeRangeErrors(data, s, t.errors);
    if (timeErrors) return { error: t.errors.checkForm, fieldErrors: timeErrors };
  }
  const ipHash = await clientIpHash();
  if (ipHash && (await recentSignupsFrom(ipHash)) >= RATE_LIMIT_PER_HOUR) {
    return { error: t.errors.rateLimited };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .for("update");
      if (!session) return { kind: "not_found" as const };
      if (session.endsAt < new Date()) return { kind: "past" as const };
      if (session.registrationState !== "open") return { kind: "closed" as const, state: session.registrationState };

      const existing = await tx.query.registrations.findFirst({
        where: and(
          eq(registrations.sessionId, sessionId),
          eq(sql`lower(${registrations.email})`, data.email),
        ),
      });

      if (existing && existing.status !== "cancelled") {
        // Throttle re-sends: claim the send slot inside the locked transaction so two
        // concurrent duplicate submissions can never both send.
        const recent =
          existing.lastEmailAt !== null &&
          Date.now() - existing.lastEmailAt.getTime() < RESEND_COOLDOWN_MS;
        if (recent) return { kind: "already_throttled" as const };
        await tx
          .update(registrations)
          .set({ lastEmailAt: new Date() })
          .where(eq(registrations.id, existing.id));
        return { kind: "already" as const, session, registration: existing };
      }

      const [{ confirmed, waitlisted }] = await tx
        .select({
          confirmed: sql<number>`count(*) filter (where ${registrations.status} = 'confirmed')::int`,
          waitlisted: sql<number>`count(*) filter (where ${registrations.status} = 'waitlisted')::int`,
        })
        .from(registrations)
        .where(
          and(
            eq(registrations.sessionId, sessionId),
            inArray(registrations.status, ["confirmed", "waitlisted"]),
          ),
        );
      // A spot is free only when nobody is queued for it – the waitlist has priority.
      const full = confirmed >= session.capacity || waitlisted > 0;

      const now = new Date();
      const values = {
        firstName: data.firstName,
        lastName: data.lastName,
        nickname: data.nickname,
        phone: data.phone,
        arrivalTime: data.arrivalTime,
        departureTime: data.departureTime,
        arrivesLate: data.arrivesLate,
        note: data.note ?? null,
        ipHash,
        canStorytell: data.canStorytell,
        isNewbie: data.isNewbie,
        status: full ? ("waitlisted" as const) : ("confirmed" as const),
        waitlistedAt: full ? now : null,
        locale,
        // claim the confirmation send right away – exactly one e-mail per (re)activation
        confirmationSentAt: now,
        lastEmailAt: now,
        updatedAt: now,
        reminderSentAt: null,
        attended: null,
      };

      let registration;
      if (existing) {
        // previously cancelled → re-activate with a fresh token
        [registration] = await tx
          .update(registrations)
          .set({ ...values, editToken: generateEditToken() })
          .where(eq(registrations.id, existing.id))
          .returning();
      } else {
        [registration] = await tx
          .insert(registrations)
          .values({
            ...values,
            sessionId,
            email: data.email,
            editToken: generateEditToken(),
          })
          .returning();
      }
      if (full) {
        return { kind: "waitlisted" as const, session, registration, position: waitlisted + 1 };
      }
      return { kind: "created" as const, session, registration };
    });

    switch (result.kind) {
      case "not_found":
        return { error: t.errors.notFound };
      case "past":
        return { error: t.errors.past };
      case "closed":
        return { error: result.state === "paused" ? t.session.registrationPaused : t.session.registrationNotOpen };
      case "already_throttled":
        return { ok: true, outcome: "already_registered", emailThrottled: true };
      case "already": {
        const emailFailed = await trySend(() =>
          sendExistingRegistrationEmail(result.registration, result.session),
        );
        return { ok: true, outcome: "already_registered", emailFailed };
      }
      case "waitlisted": {
        const emailFailed = await trySend(() =>
          sendWaitlistEmail(result.registration, result.session, result.position),
        );
        if (emailFailed) await releaseConfirmationClaim(result.registration.id);
        return { ok: true, outcome: "waitlisted", position: result.position, emailFailed };
      }
      case "created": {
        const emailFailed = await trySend(() =>
          sendConfirmationEmail(result.registration, result.session),
        );
        if (emailFailed) await releaseConfirmationClaim(result.registration.id);
        return { ok: true, outcome: "created", emailFailed };
      }
    }
  } catch (e) {
    console.error(e);
    return { error: t.errors.generic };
  }
}

/** Lets an organiser re-trigger the confirmation later when sending failed. */
async function releaseConfirmationClaim(registrationId: number) {
  await db
    .update(registrations)
    .set({ confirmationSentAt: null })
    .where(eq(registrations.id, registrationId));
}

export async function updateRegistrationAction(
  token: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { t } = await getDict();
  const current = await getRegistrationByToken(token);
  if (!current) return { error: t.errors.regNotFound };
  // the edit page hides the form once the session is over; this also stops a page left open
  if (current.session.endsAt < new Date()) return { error: t.errors.past };
  const parsed = registrationEditSchema(t.errors, current.session).safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { error: t.errors.checkForm, fieldErrors: fieldErrorsOf(parsed.error) };
  }
  const timeErrors = timeRangeErrors(parsed.data, current.session, t.errors);
  if (timeErrors) return { error: t.errors.checkForm, fieldErrors: timeErrors };
  // Editing never sends e-mail.
  const [updated] = await db
    .update(registrations)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(
      and(
        eq(registrations.editToken, token),
        inArray(registrations.status, ["confirmed", "waitlisted"]),
      ),
    )
    .returning({ id: registrations.id });
  if (!updated) return { error: t.errors.regNotFound };
  return { ok: true };
}

/** Sends the "my games" magic link when the e-mail has any registration; always answers the same. */
export async function requestMyGamesLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { locale, t } = await getDict();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: t.errors.invalidEmail, fieldErrors: { email: [t.errors.invalidEmail] } };
  const ipHash = await clientIpHash();
  if (ipHash && (await recentSignupsFrom(ipHash)) >= RATE_LIMIT_PER_HOUR) return { error: t.errors.rateLimited };
  const regs = await listRegistrationsByEmail(email);
  if (regs.length > 0) {
    try {
      await sendMyGamesLinkEmail(email, `${siteUrl()}/moje-hry/${createMyGamesToken(email)}`, locale);
    } catch (e) {
      console.error("My-games link e-mail failed", e);
    }
  }
  return { ok: true };
}

/** Organisers are alerted when a confirmed player cancels this close to the game. */
const LATE_CANCEL_HOURS = 24;

export async function cancelRegistrationAction(token: string, reason?: string): Promise<FormState> {
  const { t } = await getDict();
  const cleanReason = (reason ?? "").trim().slice(0, 500) || null;
  const now = new Date();
  const current = await getRegistrationByToken(token);
  if (!current) return { error: t.errors.regNotFound };
  if (current.session.endsAt < now) return { error: t.errors.past };
  // Cancelling never e-mails the player who cancels – but it may free a spot for a waitlisted one.
  const [updated] = await db
    .update(registrations)
    .set({ status: "cancelled", waitlistedAt: null, cancelReason: cleanReason, cancelledAt: now, updatedAt: now })
    .where(
      and(
        eq(registrations.editToken, token),
        inArray(registrations.status, ["confirmed", "waitlisted"]),
      ),
    )
    .returning({ id: registrations.id, sessionId: registrations.sessionId, nickname: registrations.nickname });
  if (!updated) return { error: t.errors.regNotFound };
  const promoted = await promoteWaitlist(updated.sessionId);
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, updated.sessionId) });
  if (session && session.startsAt.getTime() - now.getTime() < LATE_CANCEL_HOURS * 3600_000 && session.startsAt > now) {
    await notifyOrganizers(
      `Pozdní odhlášení: ${session.title}`,
      `${updated.nickname} se odhlásil/a z termínu „${session.title}“ (${formatRange(session.startsAt, session.endsAt, "cs")}), tedy méně než ${LATE_CANCEL_HOURS} h před hrou.` +
        (cleanReason ? `\nDůvod: ${cleanReason}` : "") +
        (promoted.length ? `\nMísto automaticky dostal/a náhradník: ${promoted.map((p) => p.nickname).join(", ")}.` : "\nŽádný náhradník není, místo je volné.") +
        `\n${siteUrl()}/admin/termin/${session.id}`,
    );
  }
  return { ok: true };
}
