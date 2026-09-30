import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // /r/… and /moje-hry/… carry personal links from e-mails
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/r/", "/moje-hry/"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
