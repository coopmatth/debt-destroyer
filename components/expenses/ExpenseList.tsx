"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { formatCents, formatDueDate, formatRelativeDays, titleCase } from "@/lib/format";
import { dollarsToCents } from "@/lib/money";
import type { Tables } from "@/types/database.types";

type Expense = Tables<"expenses">;

export function ExpenseList({ expenses, today }: { expenses: Expense[]; today: string }) {
  if (expenses.length === 0) {
    return (
      <EmptyState title="No bills yet">
        Add the recurring costs due before your next payday — rent, utilities,
        subscriptions.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 items-start">
      {expenses.map((expense) => (
        <ExpenseRow key={expense.id} expense={expense} today={today} />
      ))}
    </div>
  );
}

function ExpenseRow({ expense, today }: { expense: Expense; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState(expense.name);
  const [amount, setAmount] = useState((expense.amount_cents / 100).toFixed(2));
  const [dueDate, setDueDate] = useState(expense.next_due_date);

  const paid =
    expense.last_paid_date !== null && expense.last_paid_date >= expense.next_due_date;
  const overdue = !paid && expense.next_due_date < today;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/expenses/${expense.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <Card className="p-4 sm:p-4 h-full">
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
              <span className="text-xs text-ink-secondary">Amount ($)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
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
                  amount_cents: dollarsToCents(Number(amount)) ?? 0,
                  next_due_date: dueDate,
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
        <div className="flex flex-col h-full justify-between">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
              <div>
                <span className="font-medium text-ink">{expense.name}</span>
                <span className="ml-2 text-xs text-ink-muted">
                  {titleCase(expense.category)} · {titleCase(expense.frequency)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {paid ? <Badge tone="good">✓ Paid this cycle</Badge> : null}
                {overdue ? <Badge tone="critical">▲ Past due</Badge> : null}
                {!expense.is_essential ? <Badge>Non-essential</Badge> : null}
                <span className="tabular font-semibold text-ink">
                  {formatCents(expense.amount_cents)}
                </span>
              </div>
            </div>

            <p className="mt-1 text-xs text-ink-muted">
              Due {formatDueDate(expense.next_due_date, today)} (
              {formatRelativeDays(expense.next_due_date, today)})
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-hairline">
            <Button size="sm" onClick={() => setEditing(true)}>
              Edit details
            </Button>
            {!paid ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => patch({ last_paid_date: expense.next_due_date })}
              >
                Mark paid
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" });
                setBusy(false);
                router.refresh();
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
