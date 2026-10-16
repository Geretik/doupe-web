"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A number (drafts waiting for the account) or a dot (news unread) beside a link; `title` says what it means */
export type AdminNavBadge = { count?: number; title: string; testId?: string };
/** A page of the admin menu: current on its address and on the pages under `prefixes` */
export type AdminNavItem = { href: string; label: string; prefixes?: string[]; badge?: AdminNavBadge };
/** A part of the admin (Klub, Krvavka…): its link leads to its first page */
export type AdminNavGroup = { label: string; items: AdminNavItem[] };

const isAt = (path: string, item: AdminNavItem) => path === item.href || (item.prefixes ?? []).some((p) => path === p || path.startsWith(`${p}/`));

function Badge({ badge, withTestId }: { badge: AdminNavBadge; withTestId?: boolean }) {
  const testId = withTestId ? badge.testId : undefined;
  return badge.count ? (
    <span className="ml-1 rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-foreground" title={badge.title} aria-label={badge.title} data-testid={testId}>
      {badge.count}
    </span>
  ) : (
    <span className="ml-1 inline-block size-2 rounded-full bg-accent align-middle" title={badge.title} aria-label={badge.title} data-testid={testId} />
  );
}

/**
 * The admin menu in two lines: the overview and the parts of the admin, then the pages of the part shown (none on the
 * overview, which has a card for each part). A part's link carries its pages' badges, so they are seen from anywhere.
 * On the right of the first line the account's nickname, leading to its profile, and the logout.
 */
export function AdminNav({
  label,
  overview,
  groups,
  account,
  logout,
}: {
  label: string;
  overview: string;
  groups: AdminNavGroup[];
  account: { name: string; title: string };
  logout: React.ReactNode;
}) {
  const path = usePathname();
  const current = groups.find((g) => g.items.some((i) => isAt(path, i)));
  const link = "rounded-md px-2.5 py-1.5 whitespace-nowrap hover:bg-border/50";
  const on = "bg-accent/10 font-medium text-accent";
  return (
    <nav aria-label={label} className="flex flex-col gap-2 border-b border-border pb-3 text-sm print:hidden" data-admin-nav>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="-mx-2.5 flex flex-wrap items-center gap-1" data-admin-nav-parts>
          <Link href="/admin" aria-current={path === "/admin" ? "page" : undefined} className={`${link} ${path === "/admin" ? on : ""}`}>
            {overview}
          </Link>
          {groups.map((g) => {
            const badges = g.items.flatMap((i) => (i.badge ? [i.badge] : []));
            const count = badges.reduce((n, b) => n + (b.count ?? 0), 0);
            const here = g === current;
            return (
              <Link key={g.label} href={g.items[0].href} aria-current={here ? "true" : undefined} className={`${link} ${here ? on : ""}`}>
                {g.label}
                {badges.length > 0 && <Badge badge={{ count, title: badges.map((b) => b.title).join(", "), testId: badges[0].testId }} withTestId />}
              </Link>
            );
          })}
        </div>
        <span className="ml-auto flex min-w-0 items-center gap-3">
          <Link
            href="/admin/profil"
            title={account.title}
            aria-current={path === "/admin/profil" ? "page" : undefined}
            className={`truncate hover:underline ${path === "/admin/profil" ? "font-medium text-accent" : ""}`}
          >
            👤 {account.name}
          </Link>
          {logout}
        </span>
      </div>
      {/* a part with one page has no line of its own */}
      {current && current.items.length > 1 && (
        <div className="border-t border-border pt-2" data-admin-nav-pages>
          <div className="-mx-2 flex flex-wrap items-center gap-1">
            {current.items.map((i) => {
              const here = isAt(path, i);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  aria-current={here ? "page" : undefined}
                  className={`rounded-md px-2 py-1 whitespace-nowrap ${here ? "font-medium text-accent underline decoration-2 underline-offset-4" : "hover:underline"}`}
                >
                  {i.label}
                  {i.badge && <Badge badge={i.badge} />}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
