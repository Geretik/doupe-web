"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Menu link that marks itself as current on its page and on the pages under `prefixes`. */
export function NavLink({
  href,
  prefixes = [],
  className = "",
  children,
}: {
  href: string;
  prefixes?: string[];
  className?: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const current = path === href || prefixes.some((p) => path === p || path.startsWith(`${p}/`));
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`${className} ${current ? "font-medium text-accent" : ""}`}
    >
      {children}
    </Link>
  );
}
