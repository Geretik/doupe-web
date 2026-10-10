import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // /botc/r/… and /botc/moje-hry/… carry personal links from e-mails (the old top-level ones redirect there);
    // /prezence is only for the QR code on the club's table, the site does not link to it
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/botc/r/", "/botc/moje-hry/", "/r/", "/moje-hry/", "/prezence"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
