"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { inputClass } from "@/components/ui";
import type { Locale } from "@/i18n/dictionaries";
import { plural } from "@/i18n/plural";
import { LAYOUTS, MAX_PRINT, SetForm, useKeyCardSettings, type Texts } from "@/modules/known-names/components/key-card-settings";
import { generateKeyCards, renderSheets } from "@/modules/known-names/lib/keycard";

/**
 * Admin → Známá jména → Tisk: the first cards of the set on A4 pages, as the print tool does, printed alone. The set
 * (mode, starting team, code) is the phone's (KeyCardTool): card 5 on paper is card 5 on the phone. The pages' texts
 * follow the page's language; the print tool's are Czech.
 */
export function KeyCardPrint({ t, lang }: { t: Texts; lang: Locale }) {
  const { settings, mode, code, update } = useKeyCardSettings();

  // the set on A4 pages: one SVG per page, printed alone (the rest of the page is hidden in print)
  const print = useMemo(() => {
    if (!settings || !code) return null;
    const boards = generateKeyCards({ ...mode.profile, primaryTeam: settings.team }, settings.count, code);
    const pages = renderSheets(boards, LAYOUTS[settings.perPage], (b, i) => ({
      showMines: mode.mines && settings.showMines,
      minesOnAssassins: settings.minesOnAssassins,
      showAxes: true,
      title: settings.showTitle ? `${mode.name} · ${i + 1}` : "",
      note: settings.showSeed ? b.seed : "",
      lang,
    }));
    return { cards: boards.length, pages };
    // not on `settings` as a whole: stepping through the cards on the phone does not change the print
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, code, lang, settings?.team, settings?.count, settings?.perPage, settings?.showMines, settings?.minesOnAssassins, settings?.showTitle, settings?.showSeed]);
  const [preview, setPreview] = useState(false);

  if (!settings) return null;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <SetForm t={t} settings={settings} mode={mode} code={code} update={update} />

      <section className="flex flex-col gap-4" data-testid="known-names-print">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t.print.count}
            <input
              type="number"
              name="count"
              min={1}
              max={MAX_PRINT}
              defaultValue={settings.count}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1) update({ count: Math.min(MAX_PRINT, n) });
              }}
              // an empty or wrong number is left as the last good one
              onBlur={(e) => (e.target.value = String(settings.count))}
              className={`${inputClass} w-28`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.print.perPage}
            <select name="perPage" value={settings.perPage} onChange={(e) => update({ perPage: Number(e.target.value) })} className={inputClass}>
              {Object.entries(LAYOUTS).map(([n, l]) => (
                <option key={n} value={n}>
                  {n === "1" ? t.print.single : `${n} (${l.columns} × ${l.rows})`}
                </option>
              ))}
            </select>
          </label>
          <div className="flex select-none flex-col gap-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showTitle" checked={settings.showTitle} onChange={(e) => update({ showTitle: e.target.checked })} className="h-4 w-4 accent-accent" />
              {t.print.showTitle}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showSeed" checked={settings.showSeed} onChange={(e) => update({ showSeed: e.target.checked })} className="h-4 w-4 accent-accent" />
              {t.print.showSeed}
            </label>
          </div>
        </div>
        {print && (
          <p className="text-sm" data-testid="known-names-print-status">
            {plural(t.print.cards, print.cards)} · {plural(t.print.pages, print.pages.length)}
            {print.cards < settings.count && <> – {t.print.noMore}</>}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!print?.pages.length}
            className="self-start rounded-md bg-accent px-4 py-2 font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {t.print.button}
          </button>
          <p className="text-xs text-muted">{t.print.tip}</p>
        </div>
        {print && print.pages.length > 0 && (
          <details className="rounded-lg border border-border p-3" onToggle={(e) => setPreview(e.currentTarget.open)}>
            <summary className="cursor-pointer text-sm font-medium">
              {t.print.preview} ({plural(t.print.pages, print.pages.length)})
            </summary>
            {preview && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {print.pages.map((page, i) => (
                  <figure key={i} className="flex flex-col gap-1">
                    <figcaption className="text-xs text-muted">
                      {t.print.page} {i + 1}
                    </figcaption>
                    <div className="border border-border shadow-sm [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: page }} />
                  </figure>
                ))}
              </div>
            )}
          </details>
        )}
      </section>

      {/* printing: only the A4 pages, straight in <body> (the admin's column would be cut by the page); none on screen */}
      <style>{`@page { size: A4 portrait; margin: 0; }
@media print {
  html, body { background: #fff !important; }
  body > :not([data-known-names-pages]) { display: none !important; }
  [data-known-names-pages] { display: block !important; }
}`}</style>
      {print &&
        createPortal(
          <div data-known-names-pages className="hidden" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
            {print.pages.map((page, i) => (
              <div key={i} className="h-[297mm] w-[210mm] overflow-hidden break-after-page last:break-after-auto [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: page }} />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
