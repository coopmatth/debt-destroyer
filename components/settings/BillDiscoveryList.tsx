"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { formatCents, titleCase } from "@/lib/format";

interface Suggestion {
  name: string;
  estimated_amount_cents: number;
  frequency: string;
  category: string;
  next_due_date: string;
  occurrences: number;
  last_seen: string;
  amount_varies: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
}

/**
 * Suggested bills, found by scanning synced transactions.
 *
 * Every suggestion is a proposal, never an action. Adding one goes through the
 * same /api/expenses route as a hand-typed bill and gets the same validation —
 * nothing the model produced reaches the expenses table on its own authority.
 *
 * The card shows the evidence behind each suggestion (how many times it was
 * seen, when, whether the amount moves) because accepting one reserves money
 * every week, and the user should be able to disagree with it on sight.
 */
export function BillDiscoveryList() {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  async function scan() {
    setScanning(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/ai/discover-bills", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setScanning(false);

    if (!response.ok) {
      setError(body.error ?? "Could not scan your transactions.");
      return;
    }

    setSuggestions(body.suggestions ?? []);
    if (body.message) setMessage(body.message);
  }

  async function addBill(suggestion: Suggestion) {
    setAdding(suggestion.name);
    setError(null);

    const response = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: suggestion.name,
        category: suggestion.category,
        amount_cents: suggestion.estimated_amount_cents,
        frequency: suggestion.frequency,
        next_due_date: suggestion.next_due_date,
        is_essential: true,
      }),
    });

    setAdding(null);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? `Could not add ${suggestion.name}.`);
      return;
    }

    setSuggestions((current) =>
      (current ?? []).filter((item) => item.name !== suggestion.name),
    );
    router.refresh();
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-ink-secondary uppercase">
            Find bills I missed
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Scans 90 days of transactions for charges that repeat on a schedule.
          </p>
        </div>
        <Button onClick={scan} disabled={scanning}>
          {scanning ? "Scanning…" : suggestions ? "Scan again" : "Scan transactions"}
        </Button>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-hairline p-3 text-sm text-critical" role="alert">
          {error}
        </p>
      ) : null}

      {suggestions !== null && suggestions.length === 0 ? (
        <EmptyState title="Nothing new found">
          {message ?? "Every recurring charge we can see is already on your Bills page."}
        </EmptyState>
      ) : null}

      {suggestions && suggestions.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {suggestions.map((suggestion) => (
            <li
              key={`${suggestion.name}-${suggestion.next_due_date}`}
              className="rounded-lg border border-hairline p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
                <span className="font-medium text-ink">{suggestion.name}</span>
                <div className="flex items-center gap-2">
                  {suggestion.confidence !== "high" ? (
                    <Badge tone="warning">◆ {titleCase(suggestion.confidence)} confidence</Badge>
                  ) : null}
                  {suggestion.amount_varies ? <Badge>Amount varies</Badge> : null}
                  <span className="tabular font-semibold text-ink">
                    {formatCents(suggestion.estimated_amount_cents)}
                  </span>
                </div>
              </div>

              <p className="mt-1 text-xs text-ink-muted">
                {titleCase(suggestion.frequency)} · {titleCase(suggestion.category)} · seen{" "}
                {suggestion.occurrences}×, last on {suggestion.last_seen} · next due{" "}
                {suggestion.next_due_date}
              </p>

              {suggestion.reason ? (
                <p className="mt-1 text-xs text-ink-secondary">{suggestion.reason}</p>
              ) : null}

              <div className="mt-3">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={adding !== null}
                  onClick={() => addBill(suggestion)}
                >
                  {adding === suggestion.name ? "Adding…" : "Add to Bills"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {suggestions === null && !error ? (
        <p className="text-sm text-ink-muted">
          Nothing scanned yet. Bills found here are suggestions — you approve each
          one before it affects your weekly number.
        </p>
      ) : null}
    </Card>
  );
}
