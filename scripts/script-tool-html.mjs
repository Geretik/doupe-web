// `node scripts/script-tool-html.mjs <path to apps/botc/index.html>`: the club's copy of the script tool
// (.github/workflows/script-tool.yml) differs from Štefan Bačkor's original in its index.html, changed here before
// Vercel builds it, and in what scripts/script-tool.patch adds (homebrew characters, sets, a new script) – the
// original stays as it is:
// - no Google Analytics: the tool reports to botcscript.app's own Google Analytics, the club's copy should not.
//   The tag goes, and the cookie banner gets "denied" for every visitor who has not answered it (there is nothing
//   left to consent to; the banner reads that answer from localStorage);
// - a "📚 Uložit do Doupěte" button: it opens the club's library of scripts with the script of the tool's address
//   filled in (admin → Scripty, components/admin/library-script-form FROM_TOOL), to save it there;
// - a "📂 Načíst z Doupěte" button: the library to pick a script from, which then opens back here (scripty?do-toolu).
// Both speak the tool's language: Czech in Czech (and Slovak, which the tool reads as Czech), else English – as the
// club's additions in scripts/script-tool.patch (src/doupe/text.ts);
// - the tool's own privacy page (/privacy) describes the original with its Google Analytics: its address opens the
//   club's privacy page on the script tool instead (the footer links there too, script-tool.patch).
// Anything that does not go as expected fails: the deploy stops and the live copy stays.
import { readFileSync, writeFileSync } from "node:fs";

/** The tool's localStorage key of the visitor's answer (apps/botc/src/utils/consent.ts CONSENT_KEY) */
const CONSENT_KEY = "botc-cookie-consent";
/** Where the save button sends the tool's address: the library's form fills it in (library-script-form FROM_TOOL) */
const LIBRARY = "https://www.doupeol.cz/admin/botc/scripty#ze-toolu=";
/** The library to pick a script from: a script picked there opens in the tool through its short link */
const PICK = "https://www.doupeol.cz/admin/botc/scripty?do-toolu";
/** What applies to the club's copy (src/app/ochrana-udaju, PRIVACY_SECTIONS.scriptTool) */
const PRIVACY = "https://www.doupeol.cz/ochrana-udaju#script-tool";

const TAG = /\s*<script\b[^>]*\bsrc="https:\/\/www\.googletagmanager\.com\/[^"]*"[^>]*>\s*<\/script>/g;
/** An inline script that calls gtag(…): the tag's set-up */
const SETUP = /\s*<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?\bgtag\((?:(?!<\/script>)[\s\S])*?<\/script>/g;
const COMMENT = /\s*<!--[^>]*Google tag[\s\S]*?-->/g;

/** The buttons' texts in Czech and in English */
const TEXTS = {
  cs: {
    load: "📂 Načíst z Doupěte",
    loadTitle: "Vybrat script z knihovny Doupěte",
    save: "📚 Uložit do Doupěte",
    saveTitle: "Otevře knihovnu scriptů Doupěte s tímto scriptem",
    noScript: "Nejdřív otevři nebo uprav script – do Doupěte se pošle ten, který je v adrese stránky.",
  },
  en: {
    load: "📂 Load from Doupě",
    loadTitle: "Pick a script from Doupě's library",
    save: "📚 Save to Doupě",
    saveTitle: "Opens Doupě's library of scripts with this script",
    noScript: "Open or edit a script first – Doupě gets the one in the page's address.",
  },
};

/**
 * The tool keeps the script it shows in its address (`?script=…`); the save button sends that address. The tool's
 * language is the one picked in it (localStorage "i18nextLng", apps/botc/src/i18n.ts), else the browser's; a
 * language picked in the tool is saved at once, so the texts follow after any tap or key.
 */
const SAVE_BUTTON = `
    <script>
      (function () {
        var TEXTS = ${JSON.stringify(TEXTS)};
        function texts() {
          var lang = null;
          try { lang = localStorage.getItem("i18nextLng"); } catch (e) {}
          lang = (lang || (navigator.languages && navigator.languages[0]) || navigator.language || "en").split("-")[0];
          return TEXTS[lang === "cs" || lang === "sk" ? "cs" : "en"];
        }
        function set(el, text, title) {
          if (el && el.textContent !== text) el.textContent = text;
          if (el && el.title !== title) el.title = title;
        }
        function label() {
          var t = texts();
          set(document.getElementById("doupe-load"), t.load, t.loadTitle);
          set(document.getElementById("doupe-save"), t.save, t.saveTitle);
        }
        function add() {
          if (document.getElementById("doupe-bar")) return;
          var bar = document.createElement("div");
          bar.id = "doupe-bar";
          var load = document.createElement("a");
          load.id = "doupe-load";
          load.href = ${JSON.stringify(PICK)};
          var save = document.createElement("a");
          save.id = "doupe-save";
          save.href = "#";
          save.addEventListener("click", function (e) {
            e.preventDefault();
            if (!/[?&]script=/.test(location.search)) {
              alert(texts().noScript);
              return;
            }
            window.open(${JSON.stringify(LIBRARY)} + encodeURIComponent(location.href), "_blank", "noopener");
          });
          bar.appendChild(load);
          bar.appendChild(save);
          document.body.appendChild(bar);
          label();
        }
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add);
        else add();
        ["click", "pointerup", "keyup"].forEach(function (type) {
          document.addEventListener(type, function () { setTimeout(label, 0); }, true);
        });
        window.addEventListener("storage", label);
      })();
    </script>
    <style>
      #doupe-bar { position: fixed; right: 12px; bottom: 12px; z-index: 2147483000; display: flex; gap: 8px; flex-wrap: wrap;
        justify-content: flex-end; }
      #doupe-bar a { padding: 8px 12px; border-radius: 999px; background: #7a1f2b; color: #fff;
        font: 600 13px/1.2 system-ui, sans-serif; text-decoration: none; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); }
      #doupe-bar a:hover { background: #5f1621; }
      #doupe-bar #doupe-load { background: #fff; color: #7a1f2b; border: 1px solid #7a1f2b; }
      #doupe-bar #doupe-load:hover { background: #f6eef0; }
      @media print { #doupe-bar { display: none !important; } }
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
      `  <script>try{localStorage.getItem("${CONSENT_KEY}")||localStorage.setItem("${CONSENT_KEY}","denied")}catch(e){}</script>` +
        `\n    <script>if(/^\\/privacy\\/?$/.test(location.pathname))location.replace(${JSON.stringify(PRIVACY)})</script>${SAVE_BUTTON}\n  </head>`,
    );
  if (/googletagmanager|\bgtag\(/.test(out)) throw new Error("Google Analytics is still in index.html");
  return out;
}

const file = process.argv[2];
if (file) {
  try {
    writeFileSync(file, clubIndexHtml(readFileSync(file, "utf8")));
    console.log(`${file}: Google Analytics out, the buttons to load from and save into Doupě in, /privacy to the club's`);
  } catch (e) {
    console.error(`::error::${file}: ${e.message} – the tool's index.html changed, scripts/script-tool-html.mjs needs a look`);
    process.exit(1);
  }
}
