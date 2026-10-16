import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/admin";
import { AdminNav, type AdminNavGroup } from "@/components/admin/admin-nav";
import { Button } from "@/components/ui";
import { changelogStamp } from "@/data/changelog";
import { getDict } from "@/i18n/server";
import { canAccess, getAdmin, hasRole } from "@/lib/admin-auth";
import { dispatchDraftEventsLater } from "@/modules/botc/lib/draft/events";
import { countDraftAttention } from "@/modules/botc/lib/draft/queries";
import { NEWS_COOKIE } from "@/lib/news";

export const dynamic = "force-dynamic";

// The login and invitation pages live outside this route group, so they are never
// wrapped by this layout and the redirect below cannot loop.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getAdmin();
  if (!me) redirect("/admin/login");
  // the parts of the admin this account sees
  const botc = canAccess(me, "botc");
  const club = canAccess(me, "club");
  const [{ t }, attention, jar] = await Promise.all([getDict(), botc ? countDraftAttention(me.id) : { turns: 0, invites: 0 }, cookies()]);
  const n = t.admin.nav;
  // sessions where it is this account's turn, and invitations it has not answered
  const draftBadge = attention.turns + attention.invites;
  // something was added to the news since they were last read on this device
  const newsUnread = jar.get(NEWS_COOKIE)?.value !== changelogStamp();
  // draft reminders that came due (a turn left for a day) go out with any admin page, not only with the daily cron
  dispatchDraftEventsLater();
  // the parts of the admin by module, the club first; a link only to what the account may see
  const groups: AdminNavGroup[] = [];
  if (club || botc)
    groups.push({
      label: n.club,
      items: [
        ...(club
          ? [
              { href: "/admin/prezence", label: n.attendance, prefixes: ["/admin/prezence"] },
              { href: "/admin/pujcovna", label: n.loans, prefixes: ["/admin/pujcovna"] },
              { href: "/admin/statistiky-klubu", label: n.stats },
            ]
          : []),
        // the texts of the Krvavka pages belong to Krvavka (pageArea)
        { href: "/admin/web", label: n.web, prefixes: ["/admin/web"] },
      ],
    });
  if (botc)
    groups.push({
      label: n.botc,
      items: [
        { href: "/admin/botc", label: n.sessions, prefixes: ["/admin/botc/termin", "/admin/botc/novy"] },
        { href: "/admin/botc/statistiky", label: n.stats },
        {
          href: "/admin/botc/drafty",
          label: n.drafts,
          prefixes: ["/admin/botc/drafty"],
          badge: draftBadge > 0 ? { count: draftBadge, title: n.draftsAttention(attention.turns, attention.invites), testId: "draft-badge" } : undefined,
        },
        { href: "/admin/botc/scripty", label: n.scripts, prefixes: ["/admin/botc/scripty"] },
        { href: "/admin/botc/grimoary", label: n.grimoires, prefixes: ["/admin/botc/grimoary"] },
      ],
    });
  // a tool without anyone's data: every account has it
  groups.push({
    label: n.codenames,
    items: [
      { href: "/admin/kryci-jmena", label: n.keyCards },
      { href: "/admin/kryci-jmena/tisk", label: n.keyCardsPrint },
    ],
  });
  // the admin itself, across modules; the group stays for the news
  groups.push({
    label: n.administration,
    items: [
      ...(hasRole(me, "admin")
        ? [
            { href: "/admin/ucty", label: n.accounts },
            { href: "/admin/historie", label: n.log },
          ]
        : []),
      { href: "/admin/novinky", label: n.news, badge: newsUnread ? { title: n.newsUnread, testId: "news-dot" } : undefined },
    ],
  });
  return (
    // The public site is narrow (max-w-3xl in the root layout); the admin breaks out of that
    // column and uses up to 80rem so tables with names and e-mails fit without scrolling.
    <div className="relative left-1/2 flex w-[min(calc(100vw-2rem),80rem)] -translate-x-1/2 flex-col gap-6">
      <AdminNav
        label={n.label}
        overview={n.overview}
        groups={groups}
        account={{ name: me.nickname, title: `${n.profile} – ${me.email}` }}
        logout={
          <form action={logoutAction}>
            <Button type="submit" variant="secondary">{n.logout}</Button>
          </form>
        }
      />
      {children}
    </div>
  );
}
