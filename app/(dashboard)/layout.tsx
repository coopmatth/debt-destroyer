import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/dashboard/SignOutButton";

const NAV = [
  { href: "/dashboard", label: "This week" },
  { href: "/debts", label: "Debts" },
  { href: "/expenses", label: "Bills" },
  { href: "/settings", label: "Settings" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Debt Destroyer
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm text-ink-secondary transition hover:bg-surface-2 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
