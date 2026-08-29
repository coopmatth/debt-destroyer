"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { formatCents, formatDueDate, titleCase } from "@/lib/format";
import { dollarsToCents } from "@/lib/money";
import type { Tables } from "@/types/database.types";

type Expense = Tables<"expenses">;

export function ExpenseList({ expenses, today }: { expenses: Expense[]; today: string }) {
  if (expenses.length === 0) {
    return (
      <EmptyState title="No bills yet">
        Add the recurring costs due before your next payday — rent, utilities, subscriptions.
      </EmptyState>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 items-start">
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
    <Card className="flex flex-col h-full justify-between p-3">
      {editing ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-ink-secondary uppercase">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-hairline bg-surface-2 px-2 py-1 text-xs"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-ink-secondary uppercase">Amount ($)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded border border-hairline bg-surface-2 px-2 py-1 text-xs"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-ink-secondary uppercase">Due Date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded border border-hairline bg-surface-2 px-2 py-1 text-xs"
            />
          </label>
          <div className="mt-2 flex flex-col gap-1.5">
            <Button
              size="sm"
              variant="primary"
              className="w-full"
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
            <Button size="sm" variant="ghost" className="w-full" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div>
            <h3 className="font-semibold text-ink truncate leading-tight">{expense.name}</h3>
            <p className="text-[10px] text-ink-muted uppercase tracking-wide mt-0.5">
              {titleCase(expense.category)}
            </p>
            <div className="my-3">
              <span className="text-xl font-bold tabular text-ink block leading-none">
                {formatCents(expense.amount_cents)}
              </span>
              <span className="text-[10px] text-ink-secondary block mt-1">
                {titleCase(expense.frequency)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {paid ? <Badge tone="good">✓ Paid</Badge> : null}
              {overdue ? <Badge tone="critical">▲ Past due</Badge> : null}
              {!expense.is_essential ? <Badge>Non-essential</Badge> : null}
            </div>
            <p className="text-[10px] text-ink-muted leading-snug">
              Due {formatDueDate(expense.next_due_date, today)}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-1.5 pt-3 border-t border-hairline">
            {!paid ? (
              <Button
                size="sm"
                variant="primary"
                className="w-full"
                disabled={busy}
                onClick={() => patch({ last_paid_date: expense.next_due_date })}
              >
                Mark paid
              </Button>
            ) : null}
            <Button size="sm" className="w-full" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="w-full"
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
        </>
      )}
    </Card>
  );
}
