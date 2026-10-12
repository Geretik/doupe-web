import type { AccessLevel, AdminRole } from "@/db/schema";
import type { Dict } from "@/i18n/dictionaries";

/**
 * "organizátor", "Krvavka: upravuje", "Klub: nevidí": an account's or invitation's role and what it may do in each
 * part of the admin, for lists and the history; an administrator's parts do not matter, nor do missing ones.
 */
export function accessParts(t: Dict["admin"], access: { role: AdminRole; botc?: AccessLevel; club?: AccessLevel }): string[] {
  if (access.role === "admin") return [t.roles.admin];
  return [
    t.roles[access.role],
    ...(["botc", "club"] as const).flatMap((area) => {
      const level = access[area];
      return level ? [`${t.areas[area]}: ${t.access[level]}`] : [];
    }),
  ];
}
