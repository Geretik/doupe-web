/** "{n}. noc" with n = 2 → "2. noc": the grimoire's texts are plain strings (i18n/grimoire). */
export function fill(text: string, vars: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}
