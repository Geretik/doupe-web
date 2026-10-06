export type PluralForms = { one: string; few: string; other: string };

/**
 * Fills in a "{n}" template in the right plural form: 1 / 2–4 / the rest, as in Czech (English gives
 * `few` the same text as `other`). Plain strings, so a dictionary passed to a client component can use it.
 */
export function plural(forms: PluralForms, n: number) {
  return (n === 1 ? forms.one : n >= 2 && n <= 4 ? forms.few : forms.other).replace("{n}", String(n));
}
