/**
 * E-mails of the Blood on the Clocktower sessions: a sign-up confirmed or waitlisted, a spot freed, the reminder
 * before the night, the organisers' message to the players, the link to "my games". Sent through lib/email.
 */
import type { Registration, Session } from "@/db/schema";
import { dictionaries, type Locale } from "@/i18n/dictionaries";
import { escapeHtml, send } from "@/lib/email";
import { googleCalendarUrl, sessionIcsUrl } from "@/modules/botc/lib/ics";
import { formatRange, formatShortDate, formatTime, pragueDaysBetween } from "@/lib/time";
import { greetingName } from "@/lib/names";

import { scriptPollOpen } from "@/modules/botc/lib/script-poll";
import { editUrl } from "@/lib/site";

/** Magic link to the player's overview of their sign-ups. */
export async function sendMyGamesLinkEmail(email: string, url: string, locale: Locale) {
  const t = dictionaries[locale];
  const text = `${t.email.hi("")}\n\n${t.myGames.emailBody}\n${url}`;
  const html = `<p>${escapeHtml(t.myGames.emailBody)}</p><p><a href="${url}">${url}</a></p>`;
  await send(email, t.myGames.emailSubject, html, text);
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

/** Invitation to the script vote while it runs; the vote is on the player's edit page. */
function pollBlock(t: EmailDict, reg: Registration, session: Session) {
  if (!scriptPollOpen(session)) return { text: "", html: "" };
  const link = editUrl(reg.editToken);
  const names = session.scriptPoll.map((o) => o.name).join(", ");
  return {
    text: `🗳️ ${t.pollText(names)}\n${link}\n\n`,
    html: `<p>🗳️ ${escapeHtml(t.pollHtmlBefore(names))}<a href="${link}">${t.pollHtmlLink}</a>.</p>\n`,
  };
}

export async function sendConfirmationEmail(reg: Registration, session: Session) {
  const locale = localeOf(reg);
  const t = dictionaries[locale].email;
  const d = detailsTable(t, reg, session, locale);
  const cal = calendarBlock(t, session);
  const edit = editBlock(t, reg);
  const retention = retentionBlock(t);
  const poll = pollBlock(t, reg, session);

  const text = `${t.hi(greetingName(reg))}

${t.confirmed}

${d.text}

${poll.text}${cal.text}

${edit.text}

${t.seeYou}

${retention.text}`;

  const html = `<p>${escapeHtml(t.hi(greetingName(reg)))}</p>
<p>${escapeHtml(t.confirmed)}</p>
${d.html}
${poll.html}${cal.html}
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
  const poll = pollBlock(t, reg, session);

  const text = `${t.hi(greetingName(reg))}

${t.waitlisted(position)}

${d.text}

${poll.text}${edit.text}

${retention.text}`;

  const html = `<p>${escapeHtml(t.hi(greetingName(reg)))}</p>
<p>${escapeHtml(t.waitlisted(position))}</p>
${d.html}
${poll.html}${edit.html}
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
  const poll = pollBlock(t, reg, session);

  const text = `${t.hi(greetingName(reg))}

${t.reminder}

${d.text}

${scripts.text}${poll.text}${t.reminderCancelHint}
${edit.text}

${cal.text}

${t.seeYou}`;

  const html = `<p>${escapeHtml(t.hi(greetingName(reg)))}</p>
<p>${escapeHtml(t.reminder)}</p>
${d.html}
${scripts.html}
${poll.html}<p>${escapeHtml(t.reminderCancelHint)}</p>
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
