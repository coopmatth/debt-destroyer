import type { ReactNode } from "react";
import { TopNav } from "@/components/dashboard/TopNav";
import { AutoSync } from "@/components/plaid/AutoSync";

// ... existing imports ...

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  
  // ... existing auth or layout logic ...

  return (
    <div className="min-h-screen bg-background">
      <AutoSync /> 
      {/* ... existing navigation and children ... */}
      {children}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <TopNav />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
