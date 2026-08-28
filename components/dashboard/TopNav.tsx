"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/dashboard/SignOutButton";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/debts", label: "Debts" },
  { href: "/expenses", label: "Bills" },
  { href: "/settings", label: "Settings" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-hairline bg-surface/80 backdrop-blur-lg pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-xl font-bold tracking-tight text-ink">
            Debt<span className="text-series-1">Destroyer</span>
          </Link>
          <div className="md:hidden">
            <SignOutButton />
          </div>
        </div>

        <nav className="flex flex-1 items-center gap-2 overflow-x-auto pb-2 md:justify-center md:pb-0">
          {NAV.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-series-1 text-white shadow-md shadow-series-1/25"
                    : "text-ink-secondary hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:block">
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
