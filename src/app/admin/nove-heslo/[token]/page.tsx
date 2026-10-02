import Link from "next/link";
import { ResetPasswordForm } from "@/components/admin/password-forms";
import { Alert, Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { getOpenPasswordReset } from "@/lib/admin-users";

export const dynamic = "force-dynamic";

/** Public page behind a one-time link (from an administrator, or e-mailed by "forgot password"): the organiser sets a new password here. */
export default async function PasswordResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [{ t }, open] = await Promise.all([getDict(), getOpenPasswordReset(token)]);
  const r = t.admin.reset;
  if (!open) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="mb-4 text-2xl font-bold">{r.invalidTitle}</h1>
        <Alert kind="error">{r.invalidBody}</Alert>
        <p className="mt-3 text-sm">
          <Link href="/admin/zapomenute-heslo" className="underline hover:text-accent">{r.requestNew}</Link>
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-bold">{r.title}</h1>
      <Card>
        <p className="mb-4 text-sm text-muted">
          {r.intro.replace("{nickname}", open.user.nickname).replace("{email}", open.user.email)}
        </p>
        <ResetPasswordForm token={token} t={r} />
      </Card>
    </div>
  );
}
