"use client";

import { useState, useTransition } from "react";
import { updateAccountAccessAction } from "@/app/actions/admin";
import type { AccessLevel, AdminArea, AdminRole } from "@/db/schema";
import { inputClass } from "../ui";

type Access = { role: AdminRole; botc: AccessLevel; club: AccessLevel };

export type AccountAccessLabels = {
  role: string;
  roles: Record<AdminRole, string>;
  areas: Record<AdminArea, string>;
  access: Record<AccessLevel, string>;
  allParts: string;
  saved: string;
  ownRole: string;
};

/**
 * An account's role and what it may do in Krvavka and the club: three cells of the accounts table, saved as soon as
 * one changes. An administrator's parts are "everything"; nobody changes their own role.
 */
export function AccountAccessCells({
  userId,
  nickname,
  initial,
  self,
  t,
}: {
  userId: number;
  nickname: string;
  initial: Access;
  self: boolean;
  t: AccountAccessLabels;
}) {
  const [access, setAccess] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (patch: Partial<Access>) => {
    const before = access;
    const next = { ...access, ...patch };
    setAccess(next);
    setStatus(null);
    startTransition(async () => {
      const result = await updateAccountAccessAction(userId, next);
      if (result.ok) {
        setStatus({ ok: true, text: t.saved });
      } else {
        setAccess(before);
        setStatus({ ok: false, text: result.message ?? "" });
      }
    });
  };

  return (
    <>
      <td className="p-3">
        <select
          name="role"
          aria-label={`${t.role}: ${nickname}`}
          title={self ? t.ownRole : undefined}
          value={access.role}
          disabled={self || pending}
          onChange={(e) => change({ role: e.target.value as AdminRole })}
          className={inputClass}
        >
          {(Object.keys(t.roles) as AdminRole[]).map((r) => (
            <option key={r} value={r}>{t.roles[r]}</option>
          ))}
        </select>
        {status && (
          <span role="status" className={`mt-1 block text-xs ${status.ok ? "text-muted" : "text-accent"}`} data-testid="access-status">
            {status.text}
          </span>
        )}
      </td>
      {(["botc", "club"] as const).map((area) => (
        <td key={area} className="p-3">
          {access.role === "admin" ? (
            <span className="text-muted">{t.allParts}</span>
          ) : (
            <select
              name={area}
              aria-label={`${t.areas[area]}: ${nickname}`}
              value={access[area]}
              disabled={pending}
              onChange={(e) => change({ [area]: e.target.value as AccessLevel })}
              className={inputClass}
            >
              {(Object.keys(t.access) as AccessLevel[]).map((level) => (
                <option key={level} value={level}>{t.access[level]}</option>
              ))}
            </select>
          )}
        </td>
      ))}
    </>
  );
}
