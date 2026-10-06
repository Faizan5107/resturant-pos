"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/platform", label: "Restaurants" },
  { href: "/platform/plans", label: "Plans & Pricing" },
  { href: "/platform/subscriptions", label: "Subscriptions" },
  { href: "/platform/audit-log", label: "Audit Log" },
];

export default function PlatformNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 p-4 space-y-1">
      {links.map(({ href, label }) => {
        // Exact match for root, prefix match for sub-pages
        const isActive =
          href === "/platform" ? pathname === "/platform" : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center px-3 py-2 text-xs font-semibold rounded-md transition-colors ${
              isActive
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
