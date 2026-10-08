import { Resend } from "resend";
import { dictionaries, type Locale } from "@/i18n/dictionaries";
import { hasEmail } from "./retention";
import { contactEmail } from "./site";

export function escapeHtml(s: string) {
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

/** The sender address has no mailbox, so replies go to `replyTo`: the organisers (CONTACT_EMAIL) unless said otherwise. */
export async function send(to: string, subject: string, html: string, text: string, replyTo = contactEmail() ?? undefined) {
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
  const { error } = await paced(() => resend.emails.send({ from, to, subject, html, text, replyTo }));
  if (error) {
    console.error("Resend error", error);
    throw new Error("E-mail could not be sent.");
  }
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

/** "Log in with a link from an e-mail" on the login page; in the login page's language like the password reset. */
export async function sendLoginLinkEmail(user: { nickname: string; email: string }, url: string, locale: Locale) {
  const t = dictionaries[locale].email;
  const text = `${t.hi(user.nickname)}

${t.loginLinkBody}
${url}

${t.loginLinkIgnore}`;
  const html = `<p>${escapeHtml(t.hi(user.nickname))}</p>
<p>${escapeHtml(t.loginLinkBody)}</p>
<p><a href="${url}">${url}</a></p>
<p style="color:#666;font-size:90%">${escapeHtml(t.loginLinkIgnore)}</p>`;
  await send(user.email, t.loginLinkSubject, html, text);
}

/** A short notification with a link, e.g. a draft turn (modules/botc/lib/draft/events): greeting, one paragraph, the link. */
export async function sendLinkEmail(to: string, subject: string, greeting: string, body: string, url: string) {
  const text = `${greeting}\n\n${body}\n${url}`;
  const html = `<p>${escapeHtml(greeting)}</p>\n<p>${escapeHtml(body)}</p>\n<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`;
  await send(to, subject, html, text);
}

/**
 * A message from the club page's form to the organisers, always in Czech like their alerts. Replying to the
 * e-mail answers the sender.
 */
export async function sendClubMessageEmail(to: string, m: { name: string | null; email: string; text: string; locale: Locale }) {
  const from = m.name ? `${m.name} <${m.email}>` : m.email;
  const intro = `Vzkaz z formuláře na úvodní stránce webu${m.locale === "en" ? " (psáno v angličtině)" : ""}. Odpověď na tento e-mail půjde odesílateli.`;
  const text = `${intro}\n\nOd: ${from}\n\n${m.text}`;
  const html = `<p style="color:#666;font-size:90%">${escapeHtml(intro)}</p>
<p><strong>Od:</strong> ${escapeHtml(from)}</p>
<p style="white-space:pre-line">${escapeHtml(m.text)}</p>`;
  await send(to, `Vzkaz z webu od ${m.name ?? m.email}`, html, text, m.email);
}

/** Plain-text message, used for organiser alerts. */
export async function sendPlainEmail(to: string, subject: string, text: string) {
  await send(to, subject, `<p style="white-space:pre-line">${escapeHtml(text)}</p>`, text);
}
