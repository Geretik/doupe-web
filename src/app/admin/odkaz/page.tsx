import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginLinkForm } from "@/components/admin/login-form";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { isAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/** Public page: an organiser gets a one-time login link to their account's e-mail instead of typing the password. */
export default async function LoginLinkPage() {
  if (await isAdmin()) redirect("/admin");
  const { t } = await getDict();
  const l = t.admin.loginLink;
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-bold">{l.title}</h1>
      <Card>
        <LoginLinkForm t={l} />
      </Card>
      <p className="mt-3 text-sm">
        <Link href="/admin/login" className="underline hover:text-accent">{l.back}</Link>
      </p>
    </div>
  );
}
