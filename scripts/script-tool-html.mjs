// `node scripts/script-tool-html.mjs <path to apps/botc/index.html>`: the club's copy of the script tool
// (.github/workflows/script-tool.yml) without Google Analytics. Štefan Bačkor's tool reports to botcscript.app's
// own Google Analytics; the club's copy should not, and the original stays as it is – so the deploy takes the
// tag out of the checked-out index.html before Vercel builds it, and answers the cookie banner "denied" for every
// visitor who has not answered it (there is nothing left to consent to; the banner reads that answer from
// localStorage). Anything that does not go as expected fails: the deploy stops and the live copy stays.
import { readFileSync, writeFileSync } from "node:fs";

/** The tool's localStorage key of the visitor's answer (apps/botc/src/utils/consent.ts CONSENT_KEY) */
const CONSENT_KEY = "botc-cookie-consent";

const TAG = /\s*<script\b[^>]*\bsrc="https:\/\/www\.googletagmanager\.com\/[^"]*"[^>]*>\s*<\/script>/g;
/** An inline script that calls gtag(…): the tag's set-up */
const SETUP = /\s*<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?\bgtag\((?:(?!<\/script>)[\s\S])*?<\/script>/g;
const COMMENT = /\s*<!--[^>]*Google tag[\s\S]*?-->/g;

export function withoutAnalytics(html) {
  const tags = html.match(TAG)?.length ?? 0;
  const setups = html.match(SETUP)?.length ?? 0;
  if (tags !== 1 || setups !== 1) throw new Error(`expected one Google tag and one gtag() set-up, found ${tags} and ${setups}`);
  const out = html
    .replace(TAG, "")
    .replace(SETUP, "")
    .replace(COMMENT, "")
    .replace(
      "</head>",
      `  <script>try{localStorage.getItem("${CONSENT_KEY}")||localStorage.setItem("${CONSENT_KEY}","denied")}catch(e){}</script>\n  </head>`,
    );
  if (/googletagmanager|\bgtag\(/.test(out)) throw new Error("Google Analytics is still in index.html");
  if (!out.includes(CONSENT_KEY)) throw new Error("index.html has no </head>");
  return out;
}

const file = process.argv[2];
if (file) {
  try {
    writeFileSync(file, withoutAnalytics(readFileSync(file, "utf8")));
    console.log(`${file}: Google Analytics out`);
  } catch (e) {
    console.error(`::error::${file}: ${e.message} – the tool's index.html changed, scripts/script-tool-html.mjs needs a look`);
    process.exit(1);
  }
}
