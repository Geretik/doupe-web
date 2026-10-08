import type { ScriptLink } from "@/db/schema";

export function ScriptLinks({
  scripts,
  label,
  className = "",
}: {
  scripts: ScriptLink[];
  label: string;
  className?: string;
}) {
  if (!scripts.length) return null;
  return (
    <p className={`text-sm ${className}`}>
      <span aria-hidden className="mr-1.5">📜</span>
      <span className="text-muted">{label}</span>
      {scripts.map((s, i) => (
        <span key={s.url}>
          {i > 0 && <span className="text-muted">, </span>}
          <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-accent">
            {s.name}
          </a>
        </span>
      ))}
    </p>
  );
}
