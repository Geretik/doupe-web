import type { NextConfig } from "next";

/** Addresses the site had before doupeol.cz; links in sent e-mails and subscribed calendars keep working. */
const OLD_HOSTS = ["playbotc.vercel.app", "botc-olomoc.vercel.app"];
const SITE = "https://www.doupeol.cz";

const nextConfig: NextConfig = {
  async redirects() {
    return OLD_HOSTS.map((host) => ({
      // not /api/: Vercel Cron calls the production URL and does not follow redirects
      source: "/:path((?!api/).*)",
      has: [{ type: "host" as const, value: host.replaceAll(".", "\\.") }],
      destination: `${SITE}/:path`,
      permanent: true,
    }));
  },
};

export default nextConfig;
