"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Client-side navigation link that marks the current page and prefetches its data. */
export default function NavLink({ href, children, exact = false }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} prefetch aria-current={active ? "page" : undefined} className={active ? "nav-active" : undefined}>
      {children}
    </Link>
  );
}
