import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // /botc/r/… and /botc/moje-hry/… carry personal links from e-mails (the old top-level ones redirect there)
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/botc/r/", "/botc/moje-hry/", "/r/", "/moje-hry/"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
