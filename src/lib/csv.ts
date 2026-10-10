/** A cell of a CSV for Excel: a formula people typed themselves (a name, a note) is not run, separators are quoted. */
export function csvCell(v: string | number | null | undefined) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Excel must not run "=HYPERLINK(…)" as a formula
  // (a bare number such as the phone "+420777123456" cannot do anything and stays as it is)
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+$/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Semicolon-separated with a BOM, so Czech Excel opens it with the diacritics right. */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  return "﻿" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
