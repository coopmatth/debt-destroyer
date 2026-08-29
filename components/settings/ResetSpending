"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardTitle } from "@/components/ui";

export function ResetSpending() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleReset() {
    if (!confirm("Are you sure? This will ignore all transactions synced this week from your budget math.")) return;
    setBusy(true);
    await fetch("/api/transactions/reset-week", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Reset Weekly Spending</CardTitle>
          <p className="mt-1 text-sm text-ink-muted">
            Zero out your tracked spending for the current week. This tells the engine to ignore recent purchases so they don't shrink your safe-to-spend buffer.
          </p>
        </div>
        <Button onClick={handleReset} disabled={busy} variant="danger">
          {busy ? "Resetting…" : "Reset to $0"}
        </Button>
      </div>
    </Card>
  );
}
