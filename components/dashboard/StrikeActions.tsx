"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { formatCents } from "@/lib/format";

/**
 * Recording the outcome. Marking a strike paid reduces the target debt's
 * balance and rolls its due date, so the user does not retype numbers weekly.
 */
export function StrikeActions({
  strikeId,
  status,
  amountCents,
}: {
  strikeId: string;
  status: string | null;
  amountCents: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function update(next: "accepted" | "skipped" | "paid") {
    setBusy(next);
    setError(null);

    const response = await fetch(`/api/strikes/${strikeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });

    setBusy(null);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not save that.");
      return;
    }

    router.refresh();
  }

  if (status === "paid") {
    return (
      <div className="mt-6 flex items-center gap-2">
        <Badge tone="good">Paid</Badge>
        <span className="text-sm text-ink-secondary">
          {formatCents(amountCents)} recorded — balance updated.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => update("paid")} disabled={busy !== null}>
          {busy === "paid" ? "Recording…" : "I paid this"}
        </Button>
        <Button onClick={() => update("skipped")} disabled={busy !== null}>
          Skip this week
        </Button>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Marking it paid drops the balance by {formatCents(amountCents)} and moves the
        due date to next cycle.
      </p>
      {error ? (
        <p className="mt-2 text-sm text-critical" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
