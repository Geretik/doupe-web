import type { NextConfig } from "next";

/** Addresses the site had before doupeol.cz; links in sent e-mails and subscribed calendars keep working. */
const OLD_HOSTS = ["playbotc.vercel.app", "botc-olomoc.vercel.app"];
const SITE = "https://www.doupeol.cz";

/** Pages whose URL is itself the secret (edit link, "my games", invitation, new password). */
const TOKEN_PAGES = ["/r/:token", "/moje-hry/:token", "/admin/pozvanka/:token", "/admin/nove-heslo/:token"];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // nobody may show the site in a frame (clickjacking the admin)
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // links out of these pages (calendar, scripts, Discord) must not carry the secret URL along
      ...TOKEN_PAGES.map((source) => ({ source, headers: [{ key: "Referrer-Policy", value: "no-referrer" }] })),
    ];
  },
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
