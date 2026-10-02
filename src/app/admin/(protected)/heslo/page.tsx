import { ChangePasswordForm } from "@/components/admin/password-forms";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";

export default async function ChangePasswordPage() {
  await requireAdmin();
  const { t } = await getDict();
  const p = t.admin.password;
  return (
    <div className="max-w-sm">
      <h1 className="mb-4 text-2xl font-bold">{p.title}</h1>
      <Card>
        <p className="mb-4 text-sm text-muted">{p.intro}</p>
        <ChangePasswordForm t={p} />
      </Card>
    </div>
  );
}
