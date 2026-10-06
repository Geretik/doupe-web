"use client";

import { useEffect } from "react";

/** Puts `text` in front of the page title while shown, so a tab left in the background says it is your turn. */
export function TurnTitle({ text }: { text: string }) {
  useEffect(() => {
    const original = document.title;
    document.title = `${text} · ${original}`;
    return () => {
      document.title = original;
    };
  }, [text]);
  return null;
}
