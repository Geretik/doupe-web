"use client";

import { useState } from "react";
import type { ScriptLink } from "@/db/schema";
import { Button, inputClass } from "../ui";

/** autoUrl: the link was filled in from a known script, not typed */
type Row = ScriptLink & { key: number; autoUrl?: boolean };

export type ScriptsFieldsLabels = {
  title: string;
  hint: string;
  namePlaceholder: string;
  urlPlaceholder: string;
  /** {n} = row number */
  nameLabel: string;
  urlLabel: string;
  remove: string;
  add: string;
};

/** Rows of script name + link; the form gets them as `fields.name[]` / `fields.url[]`. */
export function ScriptsFields({
  initial,
  known = [],
  errors,
  fields = { name: "scriptName", url: "scriptUrl" },
  listId = "script-suggestions",
  t,
}: {
  initial: ScriptLink[];
  /** Scripts played before – offered by name, picking one fills in its link */
  known?: ScriptLink[];
  errors?: string[];
  fields?: { name: string; url: string };
  /** id of the suggestions list, unique on the page */
  listId?: string;
  t: ScriptsFieldsLabels;
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
      <p className="text-sm font-medium">{t.title}</p>
      <p className="text-xs text-muted">{t.hint}</p>
      {rows.map((row, i) => (
        <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input
            name={fields.name}
            value={row.name}
            onChange={(e) => changeName(row.key, e.target.value)}
            list={known.length ? listId : undefined}
            autoComplete="off"
            placeholder={t.namePlaceholder}
            className={inputClass}
            aria-label={t.nameLabel.replace("{n}", String(i + 1))}
          />
          <input
            name={fields.url}
            type="text"
            inputMode="url"
            value={row.url}
            onChange={(e) => update(row.key, (r) => ({ ...r, url: e.target.value, autoUrl: false }))}
            placeholder={t.urlPlaceholder}
            className={`${inputClass} ${errors?.length ? "border-accent" : ""}`}
            aria-label={t.urlLabel.replace("{n}", String(i + 1))}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
            aria-label={t.remove}
          >
            ✕
          </Button>
        </div>
      ))}
      {known.length > 0 && (
        <datalist id={listId}>
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
          {t.add}
        </Button>
      </div>
    </div>
  );
}
