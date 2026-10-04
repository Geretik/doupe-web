import Link from "next/link";

/** Small pencil link to the admin edit page, rendered only for logged-in admins; `section` jumps to a part of it. */
export function EditPencil({
  sessionId,
  title,
  section,
  className = "",
}: {
  sessionId: number;
  title: string;
  section?: "hry";
  className?: string;
}) {
  return (
    <Link
      href={`/admin/termin/${sessionId}${section ? `#${section}` : ""}`}
      title={title}
      aria-label={title}
      data-testid="edit-pencil"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted hover:border-accent hover:text-accent ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </Link>
  );
}
