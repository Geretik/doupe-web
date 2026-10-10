"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** A question waiting for its answer; `yes`: the label of the button that says yes */
type Question = { text: string; yes?: string; answer: (yes: boolean) => void };

/**
 * The grimoire's own confirmation instead of the browser's confirm(), which takes the tablet out of the full screen:
 * `ask(text, yes?)` resolves true or false; `dialog` is to render once on the page.
 */
export function useAsk(texts: { yes: string; no: string }) {
  const [question, setQuestion] = useState<Question | null>(null);
  const ask = useCallback(
    (text: string, yes?: string) =>
      new Promise<boolean>((resolve) =>
        setQuestion({
          text,
          yes,
          answer: (v) => {
            setQuestion(null);
            resolve(v);
          },
        }),
      ),
    [],
  );
  const dialog = question && createPortal(<AskDialog question={question} texts={texts} />, document.body);
  return { ask, dialog };
}

function AskDialog({ question, texts }: { question: Question; texts: { yes: string; no: string } }) {
  // Escape says no, before the setup or the dialog under it would close on it
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      question.answer(false);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [question]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => question.answer(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={question.text}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="ask"
      >
        <p className="text-base">{question.text}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => question.answer(false)} className="min-h-11 rounded-lg border border-border bg-card px-4 text-sm font-medium" data-testid="ask-no">
            {texts.no}
          </button>
          {/* the yes is ready for Enter, as with the browser's question */}
          <button
            type="button"
            autoFocus
            onClick={() => question.answer(true)}
            className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground"
            data-testid="ask-yes"
          >
            {question.yes ?? texts.yes}
          </button>
        </div>
      </div>
    </div>
  );
}
