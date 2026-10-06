"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/orders", label: "Live Orders & History" },
  { href: "/admin/products", label: "Products & Menu" },
  { href: "/admin/employees", label: "Employees & Cashiers" },
  { href: "/admin/inventory", label: "Stock" },
  { href: "/admin/sales", label: "Sales Reports" },
  { href: "/admin/expenses", label: "Expenses" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/profit-loss", label: "Profit & Loss" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
      {links.map(({ href, label, exact }) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center px-3 py-2 text-xs font-semibold rounded-md transition-colors ${
              isActive
                ? "text-white bg-zinc-900"
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
