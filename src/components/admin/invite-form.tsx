"use client";

import { useActionState, useState } from "react";
import { createInviteAction, type InviteResult } from "@/app/actions/admin";
import type { AccessLevel, AdminArea, AdminRole } from "@/db/schema";
import { Alert, Button, Field, inputClass } from "../ui";

type Labels = {
  inviteRole: string;
  inviteNote: string;
  create: string;
  creating: string;
  created: string;
  copy: string;
  copied: string;
};

export function InviteForm({
  t,
  roles,
  rolesHint,
  areas,
  areasHint,
  access,
}: {
  t: Labels;
  roles: Record<AdminRole, string>;
  rolesHint: Record<AdminRole, string>;
  areas: Record<AdminArea, string>;
  areasHint: Record<AdminArea, string>;
  access: Record<AccessLevel, string>;
}) {
  const [state, action, pending] = useActionState<InviteResult, FormData>(createInviteAction, {});
  const [role, setRole] = useState<AdminRole>("organizer");
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && state.url && (
        <Alert kind="success">
          <span className="block">{t.created}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <code className="select-all break-all text-xs" data-testid="invite-url">{state.url}</code>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.url!);
                  setCopied(true);
                } catch {
                  /* clipboard unavailable – the link is selectable anyway */
                }
              }}
            >
              {copied ? t.copied : t.copy}
            </Button>
          </span>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.inviteRole} name="role" hint={rolesHint[role]}>
          <select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value as AdminRole)} className={inputClass}>
            {(Object.keys(roles) as AdminRole[]).map((r) => (
              <option key={r} value={r}>{roles[r]}</option>
            ))}
          </select>
        </Field>
        <Field label={t.inviteNote} name="note">
          <input id="note" name="note" maxLength={200} className={inputClass} />
        </Field>
        {/* an administrator may do everything anyway */}
        {role === "organizer" &&
          (["botc", "club"] as const).map((area) => (
            <Field key={area} label={areas[area]} name={area} hint={areasHint[area]}>
              <select id={area} name={area} defaultValue="edit" className={inputClass}>
                {(Object.keys(access) as AccessLevel[]).map((level) => (
                  <option key={level} value={level}>{access[level]}</option>
                ))}
              </select>
            </Field>
          ))}
      </div>
      <div>
        <Button type="submit" disabled={pending}>{pending ? t.creating : t.create}</Button>
      </div>
    </form>
  );
}
