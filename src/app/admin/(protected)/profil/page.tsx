import { ChangePasswordForm } from "@/components/admin/password-forms";
import { LogoutOthersButton, QrScanner } from "@/components/admin/profile";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";

/** The organiser's own account: log in another device with a QR code, change the password, log out other devices. */
export default async function ProfilePage() {
  await requireAdmin();
  const { t } = await getDict();
  const p = t.admin.profile;
  const pw = t.admin.password;
  return (
    <div className="flex max-w-sm flex-col gap-6">
      <h1 className="text-2xl font-bold">{p.title}</h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{p.qrTitle}</h2>
        <Card>
          <p className="mb-4 text-sm text-muted">{p.qrIntro}</p>
          <QrScanner t={p} />
        </Card>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{pw.title}</h2>
        <Card>
          <p className="mb-4 text-sm text-muted">{pw.intro}</p>
          <ChangePasswordForm t={pw} />
        </Card>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{p.devicesTitle}</h2>
        <Card>
          <p className="mb-4 text-sm text-muted">{p.devicesIntro}</p>
          <LogoutOthersButton t={p} />
        </Card>
      </section>
    </div>
  );
}
