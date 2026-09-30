import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/admin";
import { Button } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { getAdmin, hasRole } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// The login and invitation pages live outside this route group, so they are never
// wrapped by this layout and the redirect below cannot loop.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getAdmin();
  if (!me) redirect("/admin/login");
  const { t } = await getDict();
  return (
    // The public site is narrow (max-w-3xl in the root layout); the admin breaks out of that
    // column and uses up to 80rem so tables with names and e-mails fit without scrolling.
    <div className="relative left-1/2 flex w-[min(calc(100vw-2rem),80rem)] -translate-x-1/2 flex-col gap-6">
      <nav className="flex flex-wrap items-center gap-3 border-b border-border pb-3 text-sm print:hidden">
        <Link href="/admin" className="font-semibold">{t.admin.nav.home}</Link>
        <Link href="/admin/novy" className="hover:underline">{t.admin.nav.newSession}</Link>
        <Link href="/admin/statistiky" className="hover:underline">{t.admin.nav.stats}</Link>
        {hasRole(me, "admin") && <Link href="/admin/ucty" className="hover:underline">{t.admin.nav.accounts}</Link>}
        <span className="ml-auto flex items-center gap-3">
          <span className="truncate text-muted" title={me.email}>{me.nickname}</span>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary">{t.admin.nav.logout}</Button>
          </form>
        </span>
      </nav>
      {children}
    </div>
  );
}
