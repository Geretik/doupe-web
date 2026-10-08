"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-renders the page from the server once `at` has passed – e.g. the sign-up form appears when
 * registrations open. Retries every few seconds in case the visitor's clock runs ahead of the server's.
 */
export function RefreshAt({ at }: { at: string }) {
  const router = useRouter();
  useEffect(() => {
    const ms = new Date(at).getTime() - Date.now();
    // setTimeout overflows past ~24 days; nobody keeps a page open that long
    if (ms > 24 * 864e5) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      router.refresh();
      timer = setTimeout(tick, 5000);
    };
    timer = setTimeout(tick, Math.max(0, ms) + 1000);
    return () => clearTimeout(timer);
  }, [at, router]);
  return null;
}
