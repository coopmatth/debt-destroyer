import type { ReactNode } from "react";
import { TopNav } from "@/components/dashboard/TopNav";
import { AutoSync } from "@/components/plaid/AutoSync";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <AutoSync />
      <TopNav />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
