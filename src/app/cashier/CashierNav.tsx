"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/cashier/new-order", label: "New Order" },
  { href: "/cashier/active-orders", label: "Active Orders" },
  { href: "/cashier/expenses", label: "Expenses" },
  { href: "/cashier/inventory", label: "Receive Stock" },
];

export default function CashierNav() {
  const pathname = usePathname();

  return (
    <nav className="flex space-x-2">
      {links.map(({ href, label }) => {
        const isActive = pathname === href || (href !== "/cashier/new-order" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              isActive
                ? "bg-zinc-900 text-white"
                : "text-zinc-300 hover:text-white hover:bg-zinc-900"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
