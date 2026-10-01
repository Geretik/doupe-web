import type { MetadataRoute } from "next";
import { listUpcomingSessions } from "@/lib/queries";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Public pages and upcoming sessions for search engines; admin and token pages stay out (see robots.ts). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const upcoming = await listUpcomingSessions();
  return [
    { url: `${base}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/hry`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/botc`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/botc/o-hre`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/botc/archiv`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/ochrana-udaju`, changeFrequency: "yearly", priority: 0.2 },
    ...upcoming.map((s) => ({ url: `${base}/botc/termin/${s.id}`, changeFrequency: "daily" as const, priority: 0.6 })),
  ];
}
