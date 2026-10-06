import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/admin";
import { NavLink } from "@/components/nav-link";
import { Button } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { getAdmin, hasRole } from "@/lib/admin-auth";
import { dispatchDraftEventsLater } from "@/lib/draft/events";
import { countDraftAttention } from "@/lib/draft/queries";

export const dynamic = "force-dynamic";

const linkClass = "rounded-md px-2 py-1.5 whitespace-nowrap hover:underline";
const groupClass = "px-2 text-xs font-medium uppercase tracking-wide text-muted";

// The login and invitation pages live outside this route group, so they are never
// wrapped by this layout and the redirect below cannot loop.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getAdmin();
  if (!me) redirect("/admin/login");
  const [{ t }, attention] = await Promise.all([getDict(), countDraftAttention(me.id)]);
  const n = t.admin.nav;
  // sessions where it is this account's turn, and invitations it has not answered
  const draftBadge = attention.turns + attention.invites;
  // draft reminders that came due (a turn left for a day) go out with any admin page, not only with the daily cron
  dispatchDraftEventsLater();
  return (
    // The public site is narrow (max-w-3xl in the root layout); the admin breaks out of that
    // column and uses up to 80rem so tables with names and e-mails fit without scrolling.
    <div className="relative left-1/2 flex w-[min(calc(100vw-2rem),80rem)] -translate-x-1/2 flex-col gap-6">
      <nav aria-label={n.label} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3 text-sm print:hidden">
        {/* sections grouped by module, the current page marked; on a phone each group is a line of its own */}
        <div className="-mx-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* wraps between links on a narrow phone, never inside one */}
          <div className="flex flex-wrap items-center gap-1">
            <span className={groupClass}>{n.botc}</span>
            <NavLink href="/admin" prefixes={["/admin/termin"]} className={linkClass}>{n.sessions}</NavLink>
            <NavLink href="/admin/novy" className={linkClass}>{n.newSession}</NavLink>
            <NavLink href="/admin/statistiky" className={linkClass}>{n.stats}</NavLink>
            <NavLink href="/admin/drafty" prefixes={["/admin/drafty"]} className={linkClass}>
              {n.drafts}
              {draftBadge > 0 && (
                <span
                  className="ml-1 rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-foreground"
                  title={n.draftsAttention(attention.turns, attention.invites)}
                  aria-label={n.draftsAttention(attention.turns, attention.invites)}
                  data-testid="draft-badge"
                >
                  {draftBadge}
                </span>
              )}
            </NavLink>
            <NavLink href="/admin/scripty" prefixes={["/admin/scripty"]} className={linkClass}>{n.scripts}</NavLink>
          </div>
          <div className="flex items-center gap-1 whitespace-nowrap sm:border-l sm:border-border sm:pl-2">
            <span className={groupClass}>{n.club}</span>
            <NavLink href="/admin/web" prefixes={["/admin/web"]} className={linkClass}>{n.web}</NavLink>
            {hasRole(me, "admin") && <NavLink href="/admin/ucty" className={linkClass}>{n.accounts}</NavLink>}
          </div>
        </div>
        <span className="ml-auto flex items-center gap-3">
          <span className="truncate text-muted" title={me.email}>{me.nickname}</span>
          <NavLink href="/admin/heslo" className="hover:underline">{n.password}</NavLink>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary">{n.logout}</Button>
          </form>
        </span>
      </nav>
      {children}
    </div>
  );
}
