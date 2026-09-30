import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { postToWebhook } from "./discord";
import { sendPlainEmail } from "./email";

/**
 * Tells the organisers that something needs attention: e-mail to every admin account
 * and a Discord message when DISCORD_ALERTS_WEBHOOK_URL is configured. Never throws – alerts must not
 * break the action that triggered them.
 */
export async function notifyOrganizers(subject: string, text: string) {
  const results = await Promise.allSettled([
    (async () => {
      const users = await db.select({ email: adminUsers.email }).from(adminUsers);
      await Promise.all(users.map((u) => sendPlainEmail(u.email, `[BotC admin] ${subject}`, text)));
    })(),
    // a separate, organisers-only channel: alerts carry nicknames and cancel reasons
    postToWebhook(process.env.DISCORD_ALERTS_WEBHOOK_URL, `⚠️ **${subject}**\n${text}`),
  ]);
  for (const r of results) {
    if (r.status === "rejected") console.error("Organizer alert failed", r.reason);
  }
}
