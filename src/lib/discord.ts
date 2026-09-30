import type { Session } from "@/db/schema";
import { sessionUrl } from "./ics";
import { formatRange } from "./time";

export function discordConfigured() {
  return Boolean(process.env.DISCORD_WEBHOOK_URL);
}

/** Posts a plain message to the public announcements webhook; returns false when not configured or failed. Never throws. */
export async function postDiscordMessage(content: string) {
  return postToWebhook(process.env.DISCORD_WEBHOOK_URL, content);
}

/** Posts to any Discord webhook; false when the URL is missing or the post failed. Never throws. */
export async function postToWebhook(url: string | undefined, content: string) {
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) console.error("Discord webhook failed", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("Discord webhook failed", e);
    return false;
  }
}

/** "Two days to go, N spots left" nudge. */
export function spotsLeftMessage(s: Session, free: number) {
  return `🕰️ **${s.title}** je už za dva dny a zbývá ještě **${free} ${free === 1 ? "volné místo" : free < 5 ? "volná místa" : "volných míst"}** z ${s.capacity}!\n📅 ${formatRange(s.startsAt, s.endsAt, "cs")} · 📍 ${s.place}\nRegistrace: ${sessionUrl(s.id)}`;
}

/**
 * Posts a session announcement to the Discord webhook from DISCORD_WEBHOOK_URL.
 * Returns "sent", "not_configured" or "failed"; never throws.
 */
export async function announceSessionOnDiscord(
  s: Session,
  freeSpots: number,
): Promise<"sent" | "not_configured" | "failed"> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return "not_configured";
  const fields = [
    { name: "📅 Kdy", value: formatRange(s.startsAt, s.endsAt, "cs"), inline: false },
    { name: "📍 Kde", value: s.place, inline: true },
    { name: "👥 Volná místa", value: `${freeSpots} z ${s.capacity}`, inline: true },
  ];
  if (s.storyteller) fields.push({ name: "🎩 Vypravěč", value: s.storyteller, inline: true });
  if (s.scripts.length) {
    fields.push({
      name: "📜 Scripty",
      value: s.scripts.map((x) => `[${x.name}](${x.url})`).join(", "),
      inline: false,
    });
  }
  const body = {
    content: `🕰️ Nový herní večer: **${s.title}** – ${
      s.registrationState === "open" ? "registrace otevřena!" : s.registrationState === "paused" ? "registrace jsou zatím pozastavené." : "registrace se otevřou později."
    }`,
    embeds: [
      {
        title: s.title,
        url: sessionUrl(s.id),
        description: s.note ?? undefined,
        color: 0x8b1e2d,
        fields,
      },
    ],
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("Discord webhook failed", res.status, await res.text());
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("Discord webhook failed", e);
    return "failed";
  }
}
