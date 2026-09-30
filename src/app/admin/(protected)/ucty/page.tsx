import { redirect } from "next/navigation";
import { deleteAdminUserAction, revokeInviteAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/admin/action-button";
import { InviteForm } from "@/components/admin/invite-form";
import { ResetLinkButton } from "@/components/admin/password-forms";
import { Button, Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { getAdmin, hasRole } from "@/lib/admin-auth";
import { INVITE_DAYS, listAdminUsers, listOpenInvites, RESET_DAYS } from "@/lib/admin-users";
import { inviteUrl } from "@/lib/site";
import { formatDate } from "@/lib/time";

export default async function AccountsPage() {
  const me = await getAdmin();
  if (!hasRole(me, "admin")) redirect("/admin");
  const [{ locale, t }, users, invites] = await Promise.all([getDict(), listAdminUsers(), listOpenInvites()]);
  const a = t.admin.accounts;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">{a.title}</h1>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                <th className="p-3">{a.nickname}</th>
                <th className="p-3">{a.email}</th>
                <th className="p-3">{a.role}</th>
                <th className="p-3">{a.lastLogin}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    {u.nickname}
                    {u.id === me!.id && <span className="ml-2 text-xs text-muted">({a.you})</span>}
                  </td>
                  <td className="p-3"><a href={`mailto:${u.email}`} className="hover:underline">{u.email}</a></td>
                  <td className="p-3">{t.admin.roles[u.role]}</td>
                  <td className="p-3 whitespace-nowrap">{u.lastLoginAt ? formatDate(u.lastLoginAt, locale) : a.never}</td>
                  <td className="p-3">
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      <ResetLinkButton
                        userId={u.id}
                        t={{ resetLink: a.resetLink, created: a.resetCreated(RESET_DAYS), copy: a.copy, copied: a.copied }}
                      />
                      {u.id !== me!.id && (
                        <ActionButton
                          action={deleteAdminUserAction.bind(null, u.id)}
                          label={a.delete}
                          confirmText={a.deleteConfirm}
                          variant="danger"
                        />
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted">{a.resetHint}</p>
      </section>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">{a.newInvite}</h2>
        <p className="mb-4 text-sm text-muted">{a.invitesHint(INVITE_DAYS)}</p>
        <InviteForm
          t={{
            inviteRole: a.inviteRole,
            inviteNote: a.inviteNote,
            create: a.create,
            creating: a.creating,
            created: a.created,
            copy: a.copy,
            copied: a.copied,
          }}
          roles={t.admin.roles}
          rolesHint={t.admin.rolesHint}
        />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{a.openInvites}</h2>
        {invites.length === 0 && <p className="text-muted">{a.noInvites}</p>}
        {invites.length > 0 && (
          <ul className="flex flex-col gap-2 text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
                <span>
                  <strong>{t.admin.roles[i.role]}</strong>
                  {i.note && <span className="text-muted"> · {i.note}</span>}
                  <span className="text-muted"> · {a.expires} {formatDate(i.expiresAt, locale)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <code className="select-all text-xs text-muted">{inviteUrl(i.token)}</code>
                  <form action={revokeInviteAction.bind(null, i.id)}>
                    <Button type="submit" variant="danger">{a.revoke}</Button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
