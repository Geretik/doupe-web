/** Public site name, shown in the header, e-mails and calendar feeds. */
export function siteName() {
  return process.env.NEXT_PUBLIC_SITE_NAME ?? "DoUPě Olomouc";
}

/** Invite to the club's Discord server – the main channel for club news. */
export const CLUB_DISCORD_URL = "https://discord.gg/vCg3WdHpZR";

/** Where players can write to the organisers: Reply-To of all e-mails and the contact on the privacy page. */
export function contactEmail() {
  return process.env.CONTACT_EMAIL?.trim() || null;
}

export function siteUrl() {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return url.replace(/\/$/, "");
}

export function editUrl(token: string) {
  return `${siteUrl()}/botc/r/${token}`;
}

export function inviteUrl(token: string) {
  return `${siteUrl()}/admin/pozvanka/${token}`;
}

/** Keep in sync with scripts/reset-link.mjs */
export function passwordResetUrl(token: string) {
  return `${siteUrl()}/admin/nove-heslo/${token}`;
}

/** A draft in the admin; the link of the draft e-mails. */
export function draftUrl(draftId: number) {
  return `${siteUrl()}/admin/drafty/${draftId}`;
}

/**
 * The club's script tool (BoardGames, botcscript.app), which opens a script from `?script=<gzip + base64 JSON>`:
 * scripts made from a draft are printed and translated there. SCRIPT_TOOL_URL points it elsewhere.
 */
export function scriptToolUrl() {
  return (process.env.SCRIPT_TOOL_URL?.trim() || "https://botcscript.app").replace(/\/$/, "");
}
