"use server";

import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { getDict } from "@/i18n/server";
import { sendClubMessageEmail } from "@/lib/email";
import { throttleMessage } from "@/lib/link-throttle";
import { contactEmail } from "@/lib/site";
import { fieldErrorsOf, messageSchema, type FormState } from "@/lib/validation";

/** The organisers' mailbox (CONTACT_EMAIL), or every account's e-mail when it is not configured. */
async function messageRecipients() {
  const contact = contactEmail();
  if (contact) return [contact];
  return (await db.select({ email: adminUsers.email }).from(adminUsers)).map((u) => u.email);
}

/**
 * "Leave us a message" on the club page: e-mails the message to the organisers with Reply-To set to the
 * sender. The site keeps nothing but the throttling fingerprints; the sender gets no copy, so the form
 * cannot be used to send e-mails to someone else's address.
 */
export async function sendMessageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { locale, t } = await getDict();
  const parsed = messageSchema(t.club.message, t.errors).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: t.errors.checkForm, fieldErrors: fieldErrorsOf(parsed.error) };
  const { name, email, text, website } = parsed.data;
  // honeypot hit – pretend success
  if (website) return { ok: true };
  if (await throttleMessage(email)) return { error: t.club.message.tooMany };
  const recipients = await messageRecipients();
  try {
    if (!recipients.length) throw new Error("No CONTACT_EMAIL and no accounts to send the message to.");
    await Promise.all(recipients.map((to) => sendClubMessageEmail(to, { name, email, text, locale })));
  } catch (e) {
    console.error("Club message could not be sent", e);
    return { error: t.club.message.failed };
  }
  return { ok: true };
}
