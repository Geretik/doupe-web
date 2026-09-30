"use client";

import { useState } from "react";
import { Button } from "./ui";

/** Copies the link (or opens the native share sheet on phones); the page's metadata makes the link preview. */
export function ShareButton({ url, title, label, copiedLabel }: { url: string; title: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={async () => {
        try {
          if (typeof navigator.share === "function" && /Mobi|Android/i.test(navigator.userAgent)) {
            await navigator.share({ title, url });
            return;
          }
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          /* cancelled or clipboard unavailable */
        }
      }}
    >
      {copied ? copiedLabel : `🔗 ${label}`}
    </Button>
  );
}
