import { Resend } from "resend";
import type { Registration, Session } from "@/db/schema";
import { dictionaries, type Locale } from "@/i18n/dictionaries";
import { googleCalendarUrl, sessionIcsUrl } from "./ics";
import { formatRange, formatShortDate, formatTime, pragueDaysBetween } from "./time";
import { greetingName } from "./names";
import { hasEmail } from "./retention";
import { contactEmail, editUrl } from "./site";

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** EMAIL_FROM as configured, with stray wrapping quotes removed (a common paste mistake in dashboards). */
function fromAddress() {
  const raw = (process.env.EMAIL_FROM ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
  return raw || undefined;
}

/** Resend's default limit is 2 requests per second: sends from one server instance queue up behind each other. */
const SEND_GAP_MS = 550;
let sendQueue: Promise<unknown> = Promise.resolve();
function paced<T>(fn: () => Promise<T>): Promise<T> {
  const run = sendQueue.then(fn);
  sendQueue = run.catch(() => {}).then(() => new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS)));
  return run;
}

async function send(to: string, subject: string, html: string, text: string) {
  // the address was deleted after the session, or the player has none; sending would only bounce
  if (!hasEmail(to)) return;
  const apiKey = process.env.RESEND_API_KEY;
  const from = fromAddress();
  if (!apiKey || !from) {
    console.log(`[email → ${to}] ${subject}\n${text}`);
    return;
  }
  // Development without a verified Resend domain: deliver everything to one inbox,
  // keeping the original recipient visible in the subject and body.
  const redirect = (process.env.EMAIL_REDIRECT_TO ?? "").trim();
  if (redirect && redirect.toLowerCase() !== to.toLowerCase()) {
    subject = `[→ ${to}] ${subject}`;
    text = `Původní příjemce / original recipient: ${to}\n\n${text}`;
    html = `<p style="color:#666;font-size:90%">Původní příjemce / original recipient: ${escapeHtml(to)}</p>${html}`;
    to = redirect;
  }
  const resend = new Resend(apiKey);
  // the sender address has no mailbox; replies go to the organisers instead
  const replyTo = contactEmail() ?? undefined;
  const { error } = await paced(() => resend.emails.send({ from, to, subject, html, text, replyTo }));
  if (error) {
    console.error("Resend error", error);
    throw new Error("E-mail could not be sent.");
  }
}

/** "You sit at table N" with the table mates' nicknames. */
export async function sendTableEmail(reg: Registration, session: Session, table: { number: number; storyteller: string | null }, mates: string[]) {
  const locale = localeOf(reg);
  const t = dictionaries[locale].email;
  const edit = editBlock(t, reg);
  const st = table.storyteller ?? session.storyteller;
  const text = `${t.hi(greetingName(reg))}

${t.tableBody(table.number)}${st ? ` ${t.tableStoryteller(st)}` : ""}
${mates.length ? `\n${t.tableMates} ${mates.join(", ")}\n` : ""}
${t.session}: ${session.title}
${t.when}: ${formatRange(session.startsAt, session.endsAt, locale)}
${t.where}: ${session.place}

${edit.text}

${t.seeYou}`;
  const html = `<p>${escapeHtml(t.hi(greetingName(reg)))}</p>
<p>${escapeHtml(t.tableBody(table.number))}${st ? ` ${escapeHtml(t.tableStoryteller(st))}` : ""}</p>
${mates.length ? `<p>${escapeHtml(t.tableMates)} ${escapeHtml(mates.join(", "))}</p>` : ""}
<p>${escapeHtml(session.title)} · ${escapeHtml(formatRange(session.startsAt, session.endsAt, locale))} · ${escapeHtml(session.place)}</p>
${edit.html}
<p>${t.seeYou}</p>`;
  await send(reg.email, t.tableSubject(session.title, table.number), html, text);
}

/** Magic link to the player's overview of their sign-ups. */
export async function sendMyGamesLinkEmail(email: string, url: string, locale: Locale) {
  const t = dictionaries[locale];
  const text = `${t.email.hi("")}\n\n${t.myGames.emailBody}\n${url}`;
  const html = `<p>${escapeHtml(t.myGames.emailBody)}</p><p><a href="${url}">${url}</a></p>`;
  await send(email, t.myGames.emailSubject, html, text);
}

/** "Forgot password" link for an organiser account; organiser accounts have no language, so it is the one of the login page. */
export async function sendPasswordResetEmail(user: { nickname: string; email: string }, url: string, locale: Locale) {
  const t = dictionaries[locale].email;
  const text = `${t.hi(user.nickname)}

${t.passwordResetBody}
${url}

${t.passwordResetIgnore}`;
  const html = `<p>${escapeHtml(t.hi(user.nickname))}</p>
<p>${escapeHtml(t.passwordResetBody)}</p>
<p><a href="${url}">${url}</a></p>
<p style="color:#666;font-size:90%">${escapeHtml(t.passwordResetIgnore)}</p>`;
  await send(user.email, t.passwordResetSubject, html, text);
}

/** Plain-text message, used for organiser alerts. */
export async function sendPlainEmail(to: string, subject: string, text: string) {
  await send(to, subject, `<p style="white-space:pre-line">${escapeHtml(text)}</p>`, text);
}

function localeOf(reg: Registration): Locale {
  return reg.locale === "en" ? "en" : "cs";
}

type EmailDict = (typeof dictionaries)["cs"]["email"];

function detailsTable(t: EmailDict, reg: Registration, session: Session, locale: Locale) {
  const arrival = reg.arrivalTime ?? formatTime(session.startsAt, locale);
  const departure = reg.departureTime ?? formatTime(session.endsAt, locale);
  const when = formatRange(session.startsAt, session.endsAt, locale);
  const st = session.storyteller;
  const language = dictionaries[locale].session.languages[session.gameLanguage];
  const timesLine =
    session.arrivalMode === "late"
      ? reg.arrivesLate ? `⏰ ${t.arrivesLate}` : ""
      : `${t.yourArrivalDeparture}: ${arrival}–${departure}`;
  const text = `${t.session}: ${session.title}
${t.when}: ${when}
${t.where}: ${session.place}
🗣️ ${t.language}: ${language}
${st ? `🎩 ${t.storyteller}: ${st}\n` : ""}${timesLine}`.trimEnd();
  const html = `<table cellpadding="4" style="border-collapse:collapse">
<tr><td><strong>${t.session}</strong></td><td>${escapeHtml(session.title)}</td></tr>
<tr><td><strong>${t.when}</strong></td><td>${escapeHtml(when)}</td></tr>
<tr><td><strong>${t.where}</strong></td><td>${escapeHtml(session.place)}</td></tr>
<tr><td><strong>🗣️ ${t.language}</strong></td><td>${escapeHtml(language)}</td></tr>
${st ? `<tr><td><strong>🎩 ${t.storyteller}</strong></td><td>${escapeHtml(st)}</td></tr>\n` : ""}${
    session.arrivalMode === "late"
      ? reg.arrivesLate ? `<tr><td><strong>⏰</strong></td><td>${escapeHtml(t.arrivesLate)}</td></tr>` : ""
      : `<tr><td><strong>${t.arrivalDeparture}</strong></td><td>${arrival}–${departure}</td></tr>`
  }
</table>`;
  return { text, html, when };
}

function calendarBlock(t: EmailDict, session: Session) {
  const ics = sessionIcsUrl(session.id);
  const google = googleCalendarUrl(session);
  return {
    text: `${t.calendar}\n${t.calendarIcs}: ${ics}\n${t.calendarGoogle}: ${google}`,
    html: `<p>${escapeHtml(t.calendar)} <a href="${ics}">${t.calendarIcs}</a> · <a href="${escapeHtml(google)}">${t.calendarGoogle}</a></p>`,
  };
}

/** Small print at the end of the sign-up e-mails. */
function retentionBlock(t: EmailDict) {
  return { text: t.retentionNote, html: `<p style="color:#666;font-size:90%">${escapeHtml(t.retentionNote)}</p>` };
}

function editBlock(t: EmailDict, reg: Registration) {
  const link = editUrl(reg.editToken);
  return {
    text: `${t.editText}\n${link}`,
    html: `<p>${t.editHtmlBefore}<a href="${link}">${t.editHtmlLink}</a>${t.editHtmlAfter}</p>`,
  };
}

export async function sendConfirmationEmail(reg: Registration, session: Session) {
  const locale = localeOf(reg);
  const t = dictionaries[locale].email;
  const d = detailsTable(t, reg, session, locale);
  const cal = calendarBlock(t, session);
  const edit = editBlock(t, reg);
  const retention = retentionBlock(t);

  const text = `${t.hi(greetingName(reg))}

${t.confirmed}

${d.text}

${cal.text}

${edit.text}

${t.seeYou}

${retention.text}`;

  const html = `<p>${escapeHtml(t.hi(greetingName(reg)))}</p>
<p>${escapeHtml(t.confirmed)}</p>
${d.html}
${cal.html}
${edit.html}
<p>${t.seeYou}</p>
${retention.html}`;

  await send(reg.email, t.confirmSubject(session.title), html, text);
}

export async function sendWaitlistEmail(reg: Registration, session: Session, position: number) {
  const locale = localeOf(reg);
  const t = dictionaries[locale].email;
  const d = detailsTable(t, reg, session, locale);
  const edit = editBlock(t, reg);
  const retention = retentionBlock(t);

  const text = `${t.hi(greetingName(reg))}

${t.waitlisted(position)}

${d.text}

${edit.text}

${retention.text}`;

  const html = `<p>${escapeHtml(t.hi(greetingName(reg)))}</p>
<p>${escapeHtml(t.waitlisted(position))}</p>
${d.html}
${edit.html}
${retention.html}`;

  await send(reg.email, t.waitlistSubject(session.title), html, text);
}

export async function sendPromotedEmail(reg: Registration, session: Session) {
  const locale = localeOf(reg);
  const t = dictionaries[locale].email;
  const d = detailsTable(t, reg, session, locale);
  const cal = calendarBlock(t, session);
  const edit = editBlock(t, reg);

  const text = `${t.hi(greetingName(reg))}

${t.promoted}

${d.text}

${cal.text}

${t.promotedCancelHint}
${edit.text}

${t.seeYou}`;

  const html = `<p>${escapeHtml(t.hi(greetingName(reg)))}</p>
<p>${escapeHtml(t.promoted)}</p>
${d.html}
${cal.html}
<p>${escapeHtml(t.promotedCancelHint)}</p>
${edit.html}
<p>${t.seeYou}</p>`;

  await send(reg.email, t.promotedSubject(session.title), html, text);
}

export async function sendReminderEmail(reg: Registration, session: Session) {
  const locale = localeOf(reg);
  const t = dictionaries[locale].email;
  const d = detailsTable(t, reg, session, locale);
  const cal = calendarBlock(t, session);
  const edit = editBlock(t, reg);
  const scripts = session.scripts.length
    ? {
        text: `${t.scripts}\n${session.scripts.map((s) => `${s.name}: ${s.url}`).join("\n")}\n\n`,
        html: `<p>${escapeHtml(t.scripts)} ${session.scripts
          .map((s) => `<a href="${escapeHtml(s.url)}">${escapeHtml(s.name)}</a>`)
          .join(", ")}</p>`,
      }
    : { text: "", html: "" };

  const text = `${t.hi(greetingName(reg))}

${t.reminder}

${d.text}

${scripts.text}${t.reminderCancelHint}
${edit.text}

${cal.text}

${t.seeYou}`;

  const html = `<p>${escapeHtml(t.hi(greetingName(reg)))}</p>
<p>${escapeHtml(t.reminder)}</p>
${d.html}
${scripts.html}
<p>${escapeHtml(t.reminderCancelHint)}</p>
${edit.html}
${cal.html}
<p>${t.seeYou}</p>`;

  // the cron also reminds on the day itself (sign-ups after the day-before run, late-evening sessions)
  const days = pragueDaysBetween(new Date(), session.startsAt);
  await send(reg.email, t.reminderSubject(session.title, days, formatShortDate(session.startsAt, locale)), html, text);
}

/** Free-form message from the organisers to one player, with the edit link in the footer. */
export async function sendBroadcastEmail(
  reg: Registration,
  session: Session,
  subject: string,
  message: string,
) {
  const locale = localeOf(reg);
  const t = dictionaries[locale].email;
  const link = editUrl(reg.editToken);
  const when = formatRange(session.startsAt, session.endsAt, locale);

  const text = `${t.hi(greetingName(reg))}

${message}

—
${t.broadcastFooter(session.title, when)}
${link}`;

  const html = `<p>${escapeHtml(t.hi(greetingName(reg)))}</p>
<p style="white-space:pre-line">${escapeHtml(message)}</p>
<hr>
<p style="color:#666;font-size:90%">${escapeHtml(t.broadcastFooter(session.title, when))} <a href="${link}">${t.editHtmlLink}</a>.</p>`;

  await send(reg.email, subject, html, text);
}

export async function sendExistingRegistrationEmail(reg: Registration, session: Session) {
  const locale = localeOf(reg);
  const t = dictionaries[locale].email;
  const link = editUrl(reg.editToken);
  const when = formatRange(session.startsAt, session.endsAt, locale);
  const body =
    reg.status === "waitlisted"
      ? t.alreadyWaitlistedText(session.title, when)
      : t.alreadyText(session.title, when);
  const text = `${t.hi(greetingName(reg))}

${body}

${t.alreadyEdit}
${link}`;

  const html = `<p>${escapeHtml(t.hi(greetingName(reg)))}</p>
<p>${escapeHtml(body)}</p>
<p>${t.editHtmlBefore}<a href="${link}">${t.editHtmlLink}</a>.</p>`;

  await send(reg.email, t.existingSubject(session.title), html, text);
}
