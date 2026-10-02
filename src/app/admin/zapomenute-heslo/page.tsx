import Link from "next/link";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/admin/password-forms";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { isAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/** Public page: an organiser who forgot their password gets a one-time link to their account's e-mail. */
export default async function ForgotPasswordPage() {
  if (await isAdmin()) redirect("/admin");
  const { t } = await getDict();
  const f = t.admin.forgot;
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-bold">{f.title}</h1>
      <Card>
        <ForgotPasswordForm t={f} />
      </Card>
      <p className="mt-3 text-sm">
        <Link href="/admin/login" className="underline hover:text-accent">{f.back}</Link>
      </p>
    </div>
  );
}
