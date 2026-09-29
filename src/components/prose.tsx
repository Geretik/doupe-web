/** Headings, paragraphs and lists for the long-form text pages (O hře, Klub). */
export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-2xl font-bold tracking-tight first:mt-0">{children}</h2>;
}
export function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 text-lg font-semibold">{children}</h3>;
}
export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 leading-relaxed">{children}</p>;
}
export function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="mt-3 list-disc space-y-1.5 pl-6 leading-relaxed">{children}</ul>;
}
