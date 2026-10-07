"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { NEWS_COOKIE } from "@/lib/news";

/** Remembers on this device that the news were read; the refresh takes the dot off the menu (the layout keeps its render otherwise). */
export function MarkNewsSeen({ stamp }: { stamp: string }) {
  const router = useRouter();
  useEffect(() => {
    const value = encodeURIComponent(stamp);
    if (document.cookie.split("; ").includes(`${NEWS_COOKIE}=${value}`)) return;
    document.cookie = `${NEWS_COOKIE}=${value}; path=/admin; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }, [stamp, router]);
  return null;
}
