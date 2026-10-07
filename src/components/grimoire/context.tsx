"use client";

import { createContext, useContext } from "react";
import type { Dict, Locale } from "@/i18n/dictionaries";
import { findRole, roleIcon, roleName } from "@/lib/botc-roles";
import type { GrimoireCharacter } from "@/lib/grimoire/characters";
import type { GrimoireState } from "@/lib/grimoire/state";

export type GrimoireTexts = Dict["grimoire"];

/** What every part of the grimoire page needs: the state, the one way to change it, data and texts. */
export type GrimoireContextValue = {
  state: GrimoireState;
  /** Applies a change (one step of "undo"); does nothing when the grimoire is read-only */
  update: (change: (s: GrimoireState) => GrimoireState) => void;
  readOnly: boolean;
  characters: Record<string, GrimoireCharacter>;
  locale: Locale;
  t: GrimoireTexts;
};

export const GrimoireContext = createContext<GrimoireContextValue | null>(null);

export function useGrimoire() {
  const value = useContext(GrimoireContext);
  if (!value) throw new Error("useGrimoire outside of the grimoire");
  return value;
}

export function nameOf(roleId: string | null, locale: Locale) {
  const role = findRole(roleId);
  return role ? roleName(role, locale) : (roleId ?? "");
}

/** A character's icon; tiny pre-sized WebP from public/, no image optimisation needed. */
export function RoleIcon({ roleId, size, className = "" }: { roleId: string; size: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- see above
  return <img src={roleIcon(roleId)} alt="" width={size} height={size} draggable={false} className={`shrink-0 ${className}`} style={{ width: size, height: size }} />;
}
