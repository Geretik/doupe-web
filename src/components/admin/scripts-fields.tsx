"use client";

import { useState } from "react";
import type { ScriptLink } from "@/db/schema";
import type { Dict } from "@/i18n/dictionaries";
import { Button, inputClass } from "../ui";

/** autoUrl: the link was filled in from a known script, not typed */
type Row = ScriptLink & { key: number; autoUrl?: boolean };

export function ScriptsFields({
  initial,
  known = [],
  errors,
  t,
}: {
  initial: ScriptLink[];
  /** Scripts played before – offered by name, picking one fills in its link */
  known?: ScriptLink[];
  errors?: string[];
  t: Dict["admin"]["form"];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    (initial.length ? initial : [{ name: "", url: "" }]).map((r, i) => ({ ...r, key: i })),
  );
  const [nextKey, setNextKey] = useState(rows.length);

  const update = (key: number, change: (r: Row) => Row) =>
    setRows((rs) => rs.map((r) => (r.key === key ? change(r) : r)));

  function changeName(key: number, name: string) {
    const match = known.find((k) => k.url && k.name.toLowerCase() === name.trim().toLowerCase());
    update(key, (r) => {
      // never overwrite a link typed by hand; a filled-in one follows the name
      if (r.url && !r.autoUrl) return { ...r, name };
      return match ? { ...r, name, url: match.url, autoUrl: true } : { ...r, name, url: "", autoUrl: false };
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t.scripts}</p>
      <p className="text-xs text-muted">{t.scriptsHint}</p>
      {rows.map((row, i) => (
        <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input
            name="scriptName"
            value={row.name}
            onChange={(e) => changeName(row.key, e.target.value)}
            list={known.length ? "script-suggestions" : undefined}
            autoComplete="off"
            placeholder={t.scriptNamePlaceholder}
            className={inputClass}
            aria-label={t.scriptNameLabel.replace("{n}", String(i + 1))}
          />
          <input
            name="scriptUrl"
            type="text"
            inputMode="url"
            value={row.url}
            onChange={(e) => update(row.key, (r) => ({ ...r, url: e.target.value, autoUrl: false }))}
            placeholder="https://…"
            className={`${inputClass} ${errors?.length ? "border-accent" : ""}`}
            aria-label={t.scriptUrlLabel.replace("{n}", String(i + 1))}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
            aria-label={t.removeScript}
          >
            ✕
          </Button>
        </div>
      ))}
      {known.length > 0 && (
        <datalist id="script-suggestions">
          {known.map((k) => (
            <option key={k.name} value={k.name} />
          ))}
        </datalist>
      )}
      {errors?.map((e) => (
        <p key={e} className="text-sm font-medium text-accent">{e}</p>
      ))}
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setRows((r) => [...r, { name: "", url: "", key: nextKey }]);
            setNextKey((k) => k + 1);
          }}
        >
          {t.addScript}
        </Button>
      </div>
    </div>
  );
}
