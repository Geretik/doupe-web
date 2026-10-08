"use client";

import { useEffect } from "react";
import { botcRoles, roleIcon, storytellerRoles } from "@/modules/botc/lib/botc-roles";
import type { GrimoireState } from "@/modules/botc/lib/grimoire/state";

/** The grimoire pages the service worker keeps for opening without a connection (public/grimoar-sw.js). */
export const GRIMOIRE_SCOPE = "/admin/botc/grimoary";

const travellers = botcRoles.filter((r) => r.team === "traveller").map((r) => r.id);
const fabled = storytellerRoles.map((r) => r.id);

/**
 * Keeps this grimoire on the device for when the club's Wi-Fi is gone: registers the service worker and asks it
 * to store the page, its scripts and styles, and the icons of every character the game may need (the script's,
 * the travellers', the Fabled and Loric, the ones at the table).
 */
export function useOfflineCopy(state: Pick<GrimoireState, "script" | "seats" | "bluffs">, enabled: boolean) {
  const roles = [...new Set([...state.script.roleIds, ...travellers, ...fabled, ...state.seats.flatMap((s) => [s.role, s.believedRole]), ...state.bluffs])]
    .filter((id): id is string => !!id)
    .sort()
    .join();
  useEffect(() => {
    if (!enabled || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/grimoar-sw.js", { scope: GRIMOIRE_SCOPE })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        if (cancelled) return;
        const files = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((url) => url.startsWith(`${location.origin}/_next/static/`));
        const icons = roles.split(",").filter(Boolean).map(roleIcon);
        registration.active?.postMessage({ type: "keep", page: location.pathname, urls: [...files, ...icons] });
      })
      .catch(() => {
        // no service worker (private mode, an old browser): the grimoire works online as before
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, roles]);
}
