"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { formatApr, formatCents, formatDueDate, formatRelativeDays } from "@/lib/format";
import { dollarsToCents } from "@/lib/money";
import type { Tables } from "@/types/database.types";

type Debt = Tables<"debts">;

export function DebtList({ debts, today }: { debts: Debt[]; today: string }) {
  if (debts.length === 0) {
    return (
      <EmptyState title="No debts tracked yet">
        Add each card or loan with its APR, balance, minimum payment, and due date.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {debts.map((debt) => (
        <DebtRow key={debt.id} debt={debt} today={today} />
      ))}
    </div>
  );
}

function DebtRow({ debt, today }: { debt: Debt; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState(debt.name);
  const [balance, setBalance] = useState((debt.current_balance_cents / 100).toFixed(2));
  const [minimum, setMinimum] = useState((debt.minimum_payment_cents / 100).toFixed(2));
  const [apr, setApr] = useState(debt.apr.toString());
  const [dueDate, setDueDate] = useState(debt.next_due_date ?? "");

  const minimumMet =
    debt.next_due_date !== null &&
    debt.min_payment_paid_for_due_date === debt.next_due_date;

  const overdue = debt.next_due_date !== null && debt.next_due_date < today && !minimumMet;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/debts/${debt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <Card className="p-4 sm:p-4">
      {editing ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-secondary">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-secondary">Balance ($)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                className="w-full rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-secondary">Minimum ($)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
                className="w-full rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-secondary">APR (%)</span>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={apr}
                onChange={(e) => setApr(e.target.value)}
                className="w-full rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-secondary">Next due date</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm"
              />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() =>
                patch({
                  name: name.trim(),
                  current_balance_cents: dollarsToCents(Number(balance)) ?? 0,
                  minimum_payment_cents: dollarsToCents(Number(minimum)) ?? 0,
                  apr: Number(apr),
                  next_due_date: dueDate || null,
                })
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
            <div>
              <span className="font-medium text-ink">{debt.name}</span>
              <span className="tabular ml-2 text-sm text-ink-muted">
                {formatApr(debt.apr)} APR
              </span>
            </div>

            <div className="flex items-center gap-2">
              {minimumMet ? <Badge tone="good">✓ Minimum paid</Badge> : null}
              {overdue ? <Badge tone="critical">▲ Minimum overdue</Badge> : null}
              <span className="tabular font-semibold text-ink">
                {formatCents(debt.current_balance_cents)}
              </span>
            </div>
          </div>

          <p className="mt-1 text-xs text-ink-muted tabular">
            Minimum {formatCents(debt.minimum_payment_cents)}
            {debt.next_due_date
              ? ` · due ${formatDueDate(debt.next_due_date, today)} (${formatRelativeDays(debt.next_due_date, today)})`
              : " · no due date set"}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setEditing(true)}>
              Edit details
            </Button>
            {debt.next_due_date && !minimumMet ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  patch({ min_payment_paid_for_due_date: debt.next_due_date })
                }
              >
                Mark minimum paid
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await fetch(`/api/debts/${debt.id}`, { method: "DELETE" });
                setBusy(false);
                router.refresh();
              }}
            >
              Remove
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
