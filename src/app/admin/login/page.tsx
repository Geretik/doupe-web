import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { QrLoginPanel } from "@/components/admin/qr-login";
import { SetupForm } from "@/components/admin/setup-form";
import { Alert, Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { isAdmin } from "@/lib/admin-auth";
import { countAdminUsers } from "@/lib/admin-users";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");
  const [{ t }, users] = await Promise.all([getDict(), countAdminUsers()]);
  // no account yet → the first-run wizard, protected by ADMIN_PASSWORD
  const setup = users === 0;
  const bootstrapMissing = setup && !(process.env.ADMIN_PASSWORD && process.env.ADMIN_SECRET);
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-bold">{setup ? t.admin.setup.title : t.admin.login.title}</h1>
      {bootstrapMissing && <Alert kind="error">{t.admin.setup.bootstrapMissing}</Alert>}
      <Card>{setup ? <SetupForm t={t.admin.setup} /> : <LoginForm t={t.admin.login} />}</Card>
      {!setup && (
        <>
          <p className="mt-3 text-sm">
            <Link href="/admin/zapomenute-heslo" className="underline hover:text-accent">{t.admin.login.forgot}</Link>
          </p>
          {/* without the password: a link from an e-mail, or (the club tablet) a phone that is logged in approves it;
              both as big as each other, like a secondary Button */}
          <Card className="mt-6 flex flex-col gap-3">
            <Link
              href="/admin/odkaz"
              className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium transition hover:bg-border/40"
            >
              {t.admin.login.emailLink}
            </Link>
            <QrLoginPanel t={t.admin.login} />
          </Card>
        </>
      )}
    </div>
  );
}
