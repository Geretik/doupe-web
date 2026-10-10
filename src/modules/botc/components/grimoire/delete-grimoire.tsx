"use client";

import { useRef } from "react";
import { deleteGrimoireAction } from "@/modules/botc/actions/grimoire";

/**
 * Deletes a grimoire after a confirmation (administrators only); the game record it wrote stays. In the grimoire
 * `ask` is its own dialog, the browser's would leave the full screen.
 */
export function DeleteGrimoireButton({
  id,
  label,
  confirmText,
  compact = false,
  ask,
}: {
  id: number;
  label: string;
  confirmText: string;
  compact?: boolean;
  ask?: (text: string, yes?: string) => Promise<boolean>;
}) {
  // the form sent again once the grimoire's dialog said yes
  const asked = useRef(false);
  return (
    <form
      action={deleteGrimoireAction.bind(null, id)}
      onSubmit={(e) => {
        if (!ask) {
          if (!confirm(confirmText)) e.preventDefault();
          return;
        }
        if (asked.current) return;
        e.preventDefault();
        const form = e.currentTarget;
        void ask(confirmText, label).then((yes) => {
          if (!yes) return;
          asked.current = true;
          form.requestSubmit();
          asked.current = false;
        });
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
