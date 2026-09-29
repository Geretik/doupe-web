/** Public site name, shown in the header, e-mails and calendar feeds. */
export function siteName() {
  return process.env.NEXT_PUBLIC_SITE_NAME ?? "DoUPě Olomouc";
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
  return `${siteUrl()}/r/${token}`;
}

export function inviteUrl(token: string) {
  return `${siteUrl()}/admin/pozvanka/${token}`;
}
