// `node scripts/script-tool-html.mjs <path to apps/botc/index.html>`: the club's copy of the script tool
// (.github/workflows/script-tool.yml) differs from Štefan Bačkor's original in its index.html only, changed here
// before Vercel builds it – the original stays as it is:
// - no Google Analytics: the tool reports to botcscript.app's own Google Analytics, the club's copy should not.
//   The tag goes, and the cookie banner gets "denied" for every visitor who has not answered it (there is nothing
//   left to consent to; the banner reads that answer from localStorage);
// - a "📚 Uložit do Doupěte" button: it opens the club's library of scripts with the script of the tool's address
//   filled in (admin → Scripty, components/admin/library-script-form FROM_TOOL), to save it there.
// Anything that does not go as expected fails: the deploy stops and the live copy stays.
import { readFileSync, writeFileSync } from "node:fs";

/** The tool's localStorage key of the visitor's answer (apps/botc/src/utils/consent.ts CONSENT_KEY) */
const CONSENT_KEY = "botc-cookie-consent";
/** Where the button sends the tool's address: the library's form fills it in (library-script-form FROM_TOOL) */
const LIBRARY = "https://www.doupeol.cz/admin/botc/scripty#ze-toolu=";

const TAG = /\s*<script\b[^>]*\bsrc="https:\/\/www\.googletagmanager\.com\/[^"]*"[^>]*>\s*<\/script>/g;
/** An inline script that calls gtag(…): the tag's set-up */
const SETUP = /\s*<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?\bgtag\((?:(?!<\/script>)[\s\S])*?<\/script>/g;
const COMMENT = /\s*<!--[^>]*Google tag[\s\S]*?-->/g;

/** The tool keeps the script it shows in its address (`?script=…`); the button sends that address */
const SAVE_BUTTON = `
    <script>
      (function () {
        function add() {
          if (document.getElementById("doupe-save")) return;
          var a = document.createElement("a");
          a.id = "doupe-save";
          a.href = "#";
          a.textContent = "📚 Uložit do Doupěte";
          a.title = "Otevře knihovnu scriptů Doupěte s tímto scriptem";
          a.addEventListener("click", function (e) {
            e.preventDefault();
            if (!/[?&]script=/.test(location.search)) {
              alert("Nejdřív otevři nebo uprav script – do Doupěte se pošle ten, který je v adrese stránky.");
              return;
            }
            window.open(${JSON.stringify(LIBRARY)} + encodeURIComponent(location.href), "_blank", "noopener");
          });
          document.body.appendChild(a);
        }
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add);
        else add();
      })();
    </script>
    <style>
      #doupe-save { position: fixed; right: 12px; bottom: 12px; z-index: 2147483000; padding: 8px 12px; border-radius: 999px;
        background: #7a1f2b; color: #fff; font: 600 13px/1.2 system-ui, sans-serif; text-decoration: none;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); }
      #doupe-save:hover { background: #5f1621; }
      @media print { #doupe-save { display: none !important; } }
    </style>`;

export function clubIndexHtml(html) {
  const tags = html.match(TAG)?.length ?? 0;
  const setups = html.match(SETUP)?.length ?? 0;
  if (tags !== 1 || setups !== 1) throw new Error(`expected one Google tag and one gtag() set-up, found ${tags} and ${setups}`);
  if (html.split("</head>").length !== 2) throw new Error("expected one </head>");
  const out = html
    .replace(TAG, "")
    .replace(SETUP, "")
    .replace(COMMENT, "")
    .replace(
      "</head>",
      `  <script>try{localStorage.getItem("${CONSENT_KEY}")||localStorage.setItem("${CONSENT_KEY}","denied")}catch(e){}</script>${SAVE_BUTTON}\n  </head>`,
    );
  if (/googletagmanager|\bgtag\(/.test(out)) throw new Error("Google Analytics is still in index.html");
  return out;
}

const file = process.argv[2];
if (file) {
  try {
    writeFileSync(file, clubIndexHtml(readFileSync(file, "utf8")));
    console.log(`${file}: Google Analytics out, the button to save into Doupě in`);
  } catch (e) {
    console.error(`::error::${file}: ${e.message} – the tool's index.html changed, scripts/script-tool-html.mjs needs a look`);
    process.exit(1);
  }
}
