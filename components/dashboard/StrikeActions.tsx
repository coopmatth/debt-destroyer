"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { formatCents } from "@/lib/format";

/**
 * Recording the outcome.
 *
 * Both amounts get their own button rather than sharing a toggle. The figure on
 * the button is the figure that gets recorded against the debt, so there is no
 * state to misread — a control where the displayed number and the posted number
 * can drift apart is the wrong shape for money.
 */
export function StrikeActions({
  strikeId,
  status,
  amountCents,
  alternativeAmountCents,
}: {
  strikeId: string;
  status: string | null;
  /** What the card is leading with, and what the primary button pays. */
  amountCents: number;
  /** The full deterministic strike, when advice has reduced the headline. */
  alternativeAmountCents?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function update(next: "skipped" | "paid", paidCents?: number) {
    setBusy(next + (paidCents ?? ""));
    setError(null);

    const response = await fetch(`/api/strikes/${strikeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: next,
        // Always explicit. Without this the server falls back to the
        // deterministic amount and would drop the balance by more than was
        // actually paid whenever the advisory number is the one on screen.
        ...(next === "paid" ? { amountPaidCents: paidCents ?? amountCents } : {}),
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
      <div className="mt-6 flex items-center gap-2">
        <Badge tone="good">✓ Paid</Badge>
        <span className="text-sm text-ink-secondary">Balance updated.</span>
      </div>
    );
  }

  return (
    <div className="mt-6">
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

        <Button variant="ghost" onClick={() => update("skipped")} disabled={busy !== null}>
          Skip this week
        </Button>
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
