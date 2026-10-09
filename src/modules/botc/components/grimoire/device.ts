"use client";

import { useSyncExternalStore } from "react";

/** Settings of the grimoire on this device, kept in the browser – not in the grimoire, which every device shares. */

const EVENT = "grimoire-device";
/** What this page set, also where the browser keeps nothing (a private window) */
const memory = new Map<string, string | null>();

function read(key: string) {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** A setting as stored (null = none); `server`: what to show until the browser is read (the server's render). */
function useDeviceSetting(key: string, server: string | null): [string | null, (value: string | null) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => server,
  );
  const set = (next: string | null) => {
    memory.set(key, next);
    try {
      if (next === null) localStorage.removeItem(key);
      else localStorage.setItem(key, next);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  };
  return [value, set];
}

/**
 * Whether the grimoire is hidden on this device (the context's `hidden`): a reload in the middle of helping still
 * shows nothing, and until the browser is read it is hidden too, never the other way round.
 */
export function useHidden(id: number): [boolean, (hidden: boolean) => void] {
  const [value, set] = useDeviceSetting(`grimoire-hidden-${id}`, "1");
  return [value === "1", (hidden) => set(hidden ? "1" : null)];
}

/** How big the town's tokens, names and reminders are, against what the room allows: 60–160 %. */
export const SCALE = { min: 0.6, max: 1.6, step: 0.05 } as const;

/** The size of the town on this device, for every grimoire: each Storyteller's eyes and tablet differ. */
export function useTownScale(): [number, (scale: number) => void] {
  const [value, set] = useDeviceSetting("grimoire-scale", null);
  const n = Number(value);
  const scale = Number.isFinite(n) && n > 0 ? Math.min(SCALE.max, Math.max(SCALE.min, n)) : 1;
  return [scale, (next) => set(next === 1 ? null : String(next))];
}
