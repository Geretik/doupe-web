"use client";

import { deleteGrimoireAction } from "@/app/actions/grimoire";

/** Deletes a grimoire after a confirmation (administrators only); the game record it wrote stays. */
export function DeleteGrimoireButton({ id, label, confirmText, compact = false }: { id: number; label: string; confirmText: string; compact?: boolean }) {
  return (
    <form
      action={deleteGrimoireAction.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className={`rounded-lg border border-accent text-sm text-accent hover:bg-accent/10 ${compact ? "h-full min-h-11 px-3" : "min-h-11 px-3"}`}
        aria-label={label}
        title={label}
      >
        {compact ? "🗑️" : label}
      </button>
    </form>
  );
}
