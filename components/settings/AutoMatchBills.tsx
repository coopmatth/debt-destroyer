"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardTitle } from "@/components/ui";

export function AutoMatchBills() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleMatch() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/transactions/auto-match", { method: "POST" });
    if (res.ok) {
      setMessage("Scan complete. Your bills and spending have been updated.");
    } else {
      setMessage("Failed to run auto-match.");
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle hint="AI Detection">Auto-Match Recent Bills</CardTitle>
          <p className="mt-1 text-sm text-ink-muted">
            Have Gemini scan your recent spending to automatically detect paid bills and debts, protecting your variable budget.
          </p>
        </div>
        <Button onClick={handleMatch} disabled={busy}>
          {busy ? "Scanning…" : "Run Auto-Match"}
        </Button>
      </div>
      {message && <p className="mt-3 text-sm text-good">{message}</p>}
    </Card>
  );
}
