import type { NextConfig } from "next";

/** Addresses the site had before doupeol.cz; links in sent e-mails and subscribed calendars keep working. */
const OLD_HOSTS = ["playbotc.vercel.app", "botc-olomoc.vercel.app"];
const SITE = "https://www.doupeol.cz";

/** Pages whose URL is itself the secret (edit link, "my games", invitation, new password, login link, a device's QR login). */
const TOKEN_PAGES = ["/botc/r/:token", "/botc/moje-hry/:token", "/admin/pozvanka/:token", "/admin/nove-heslo/:token", "/admin/odkaz/:token", "/admin/qr/:token"];

/**
 * Blood on the Clocktower pages that lived at the top level before the site became the club's web:
 * links in sent e-mails, Discord posts and QR codes on printed posters keep working.
 * /kalendar.ics is not moved: calendar apps keep polling the subscribed URL and not all of them
 * follow redirects.
 */
const MOVED_TO_BOTC = ["/termin", "/archiv", "/o-hre", "/r", "/moje-hry"];
/** Of those, the ones that are pages on their own too (/termin and /r only ever had pages below them). */
const MOVED_PAGES = ["/archiv", "/o-hre", "/moje-hry"];

/**
 * Admin pages of Blood on the Clocktower that lived right under /admin before the admin became the club's overview
 * (October 2026): links in sent e-mails (drafts, a session's sign-ups), the organisers' calendar and bookmarks.
 */
const MOVED_TO_ADMIN_BOTC = ["/admin/termin", "/admin/novy", "/admin/drafty", "/admin/grimoary", "/admin/scripty", "/admin/statistiky"];

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
      // Links out of these pages (calendar, scripts, Discord) must not carry the secret URL along.
      // Only the origin, never the path; not "no-referrer", which makes a form posted before the page
      // hydrated (or without JavaScript) arrive with `Origin: null` – and Next refuses such Server Actions.
      ...TOKEN_PAGES.map((source) => ({ source, headers: [{ key: "Referrer-Policy", value: "strict-origin" }] })),
    ];
  },
  async redirects() {
    return [
      ...OLD_HOSTS.map((host) => ({
        // not /api/: Vercel Cron calls the production URL and does not follow redirects;
        // not the calendar feed: subscribed calendar apps keep polling the old address, not all follow redirects
        source: "/:path((?!api/|kalendar\\.ics$).*)",
        has: [{ type: "host" as const, value: host.replaceAll(".", "\\.") }],
        destination: `${SITE}/:path`,
        permanent: true,
      })),
      // the bare path gets its own rule: on Vercel an empty `:rest*` leaves a trailing slash, one redirect more
      ...MOVED_PAGES.map((path) => ({ source: path, destination: `/botc${path}`, permanent: true })),
      ...MOVED_TO_BOTC.map((path) => ({ source: `${path}/:rest+`, destination: `/botc${path}/:rest+`, permanent: true })),
      ...MOVED_TO_ADMIN_BOTC.flatMap((path) => [
        { source: path, destination: path.replace("/admin", "/admin/botc"), permanent: true },
        { source: `${path}/:rest+`, destination: `${path.replace("/admin", "/admin/botc")}/:rest+`, permanent: true },
      ]),
      // the list of sessions has no page of its own, it is the module's home
      { source: "/termin", destination: "/botc", permanent: true },
      // the club page became the home page
      { source: "/klub", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
