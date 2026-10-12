import { deleteAdminUserAction, revokeInviteAction } from "@/app/actions/admin";
import { AccountAccessCells } from "@/components/admin/account-access";
import { accessParts } from "@/components/admin/access-text";
import { ActionButton } from "@/components/admin/action-button";
import { InviteForm } from "@/components/admin/invite-form";
import { ResetLinkButton } from "@/components/admin/password-forms";
import { Button, Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";
import { INVITE_DAYS, listAdminUsers, listOpenInvites, RESET_DAYS } from "@/lib/admin-users";
import { inviteUrl } from "@/lib/site";
import { formatDate } from "@/lib/time";

export default async function AccountsPage() {
  const me = await requireAdmin("admin");
  const [{ locale, t }, users, invites] = await Promise.all([getDict(), listAdminUsers(), listOpenInvites()]);
  const a = t.admin.accounts;
  const accessLabels = {
    role: a.role,
    roles: t.admin.roles,
    areas: t.admin.areas,
    access: t.admin.access,
    allParts: a.allParts,
    saved: a.saved,
    ownRole: a.ownRole,
  };

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
                <th className="p-3" title={t.admin.areasHint.botc}>{t.admin.areas.botc}</th>
                <th className="p-3" title={t.admin.areasHint.club}>{t.admin.areas.club}</th>
                <th className="p-3">{a.lastLogin}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    {u.nickname}
                    {u.id === me.id && <span className="ml-2 text-xs text-muted">({a.you})</span>}
                  </td>
                  <td className="p-3"><a href={`mailto:${u.email}`} className="hover:underline">{u.email}</a></td>
                  <AccountAccessCells
                    userId={u.id}
                    nickname={u.nickname}
                    initial={{ role: u.role, botc: u.botcAccess, club: u.clubAccess }}
                    self={u.id === me.id}
                    t={accessLabels}
                  />
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
        <div className="flex flex-col gap-1 text-sm text-muted">
          <p>{a.accessHint}</p>
          {(["botc", "club"] as const).map((area) => (
            <p key={area}>
              <strong>{t.admin.areas[area]}:</strong> {t.admin.areasHint[area]}
            </p>
          ))}
          <p>{a.resetHint}</p>
        </div>
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
          areas={t.admin.areas}
          areasHint={t.admin.areasHint}
          access={t.admin.access}
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
                  <strong>{accessParts(t.admin, { role: i.role, botc: i.botcAccess, club: i.clubAccess }).join(" · ")}</strong>
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
