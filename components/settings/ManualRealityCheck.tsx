"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardTitle } from "@/components/ui";

export function ManualRealityCheck() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/ai/reality-check", { method: "POST" });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error ?? "Could not run the reality check.");
        return;
      }

      if (body.skipped) {
        setMessage(body.message ?? "Skipped.");
      } else {
        setMessage(`Done! Adjusted strike: $${(body.adjusted_strike_cents / 100).toFixed(2)}.`);
      }
      router.refresh();
    } catch {
      setError("Network error occurred.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle hint="AI second opinion">Manual Reality Check</CardTitle>
          <p className="mt-1 text-sm text-ink-muted">
            Analyze your recent spending volatility and cash floor to adjust this week&rsquo;s strike amount.
          </p>
        </div>
        <Button onClick={runCheck} disabled={busy}>
          {busy ? "Analyzing…" : "Run Reality Check"}
        </Button>
      </div>
      {message && <p className="mt-3 text-sm text-good">{message}</p>}
      {error && <p className="mt-3 text-sm text-critical">{error}</p>}
    </Card>
  );
}
