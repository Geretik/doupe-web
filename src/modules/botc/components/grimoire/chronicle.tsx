"use client";

import type { Locale } from "@/i18n/dictionaries";
import type { GrimoireEvent, GrimoireState } from "@/modules/botc/lib/grimoire/state";
import { fill } from "@/modules/botc/lib/grimoire/text";
import { nameOf, useGrimoire, type GrimoireTexts } from "./context";

/** One line of the chronicle: who died (by whose ability), lived through an attack, came back, became whom. */
function eventLine(e: GrimoireEvent, locale: Locale, t: GrimoireTexts) {
  const x = { name: e.name || "?", role: e.role ? nameOf(e.role, locale) : t.noRole, by: e.by ? nameOf(e.by, locale) : "" };
  const c = t.chronicle;
  if (e.kind === "death") return fill(e.fake ? c.fake : e.by ? c.deathBy : c.death, x);
  if (e.kind === "survived") return fill(c.survived, x);
  if (e.kind === "revived") return fill(e.by ? c.revivedBy : c.revived, x);
  return fill(c.became, x);
}

/** The game's log by night and day, in order: what the chronicle shows. */
export function chronicle(state: Pick<GrimoireState, "log">, locale: Locale, t: GrimoireTexts) {
  const groups: { key: string; label: string; lines: string[] }[] = [];
  for (const e of state.log ?? []) {
    const key = `${e.round}${e.day ? "d" : "n"}`;
    if (groups.at(-1)?.key !== key) {
      const label = e.round === 0 ? t.chronicle.setup : fill(e.day ? t.phases.day : t.phases.night, { n: e.round });
      groups.push({ key, label, lines: [] });
    }
    groups.at(-1)!.lines.push(eventLine(e, locale, t));
  }
  return groups;
}

/** The chronicle as one paragraph for the game's note, cut after the last night or day that fits in `max`. */
export function chronicleText(state: Pick<GrimoireState, "log">, locale: Locale, t: GrimoireTexts, max: number) {
  let text = "";
  for (const { label, lines } of chronicle(state, locale, t)) {
    const part = `${text ? " " : ""}${label}: ${lines.join("; ")}.`;
    if (text.length + part.length > max) return `${text.slice(0, max - 2)} …`;
    text += part;
  }
  return text;
}

/** The chronicle tab: what happened, by night and day, as the grimoire logged it. */
export function ChroniclePanel() {
  const { state, locale, t } = useGrimoire();
  const groups = chronicle(state, locale, t);
  return (
    <div className="flex flex-col gap-3" data-testid="chronicle">
      <h3 className="text-lg font-bold">{t.tabs.log}</h3>
      {groups.length === 0 && <p className="text-sm text-muted">{t.chronicle.empty}</p>}
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-1">
          <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">{g.label}</h4>
          <ul className="flex flex-col gap-0.5 text-sm">
            {g.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
