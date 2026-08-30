"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { formatCents } from "@/lib/format";
import { dollarsToCents } from "@/lib/money";

export function StrikeActions({
  strikeId,
  status,
  amountCents,
  alternativeAmountCents,
}: {
  strikeId: string;
  status: string | null;
  amountCents: number;
  alternativeAmountCents?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState((amountCents / 100).toFixed(2));
  const [isCustom, setIsCustom] = useState(false);

  async function update(next: "skipped" | "paid", paidCents?: number) {
    setBusy(next + (paidCents ?? ""));
    setError(null);

    // If using the custom input, convert it to cents. Otherwise use the passed value.
    const finalCents = 
      isCustom && next === "paid" 
        ? dollarsToCents(Number(customAmount)) ?? amountCents 
        : (paidCents ?? amountCents);

    const response = await fetch(`/api/strikes/${strikeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: next,
        ...(next === "paid" ? { amountPaidCents: finalCents } : {}),
      }),
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
      <div className="mt-6 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Badge tone="good">✓ Paid</Badge>
          <span className="text-sm text-ink-secondary">Balance updated.</span>
        </div>
        <p className="text-xs text-ink-muted mt-1">
          Need to correct this? Update the balance on the Debts tab.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3">
        {isCustom ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-secondary">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="w-32 rounded-lg border border-hairline bg-surface-2 px-3 py-1.5 text-sm"
            />
            <Button variant="primary" onClick={() => update("paid")} disabled={busy !== null}>
              {busy?.startsWith("paid") ? "Recording…" : "Confirm Payment"}
            </Button>
            <Button variant="ghost" onClick={() => setIsCustom(false)}>Cancel</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => update("paid")} disabled={busy !== null}>
              {busy?.startsWith("paid") ? "Recording…" : `I paid ${formatCents(amountCents)}`}
            </Button>

            {alternativeAmountCents !== undefined && alternativeAmountCents !== amountCents ? (
              <Button
                onClick={() => update("paid", alternativeAmountCents)}
                disabled={busy !== null}
                title="Pay the full mathematically safe amount instead"
              >
                I paid {formatCents(alternativeAmountCents)}
              </Button>
            ) : null}

            <Button onClick={() => setIsCustom(true)} disabled={busy !== null}>
              Custom Amount
            </Button>

            <Button variant="ghost" onClick={() => update("skipped")} disabled={busy !== null}>
              Skip this week
            </Button>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-ink-muted">
        Recording a payment drops the balance by that amount and moves the due date
        to next cycle.
      </p>

      {error ? (
        <p className="mt-2 text-sm text-critical" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
