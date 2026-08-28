"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { formatCents, formatDueDate, formatRelativeDays, titleCase } from "@/lib/format";
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
    <div className="flex flex-col gap-3">
      {expenses.map((expense) => (
        <ExpenseRow key={expense.id} expense={expense} today={today} />
      ))}
    </div>
  );
}

function ExpenseRow({ expense, today }: { expense: Expense; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const paid =
    expense.last_paid_date !== null && expense.last_paid_date >= expense.next_due_date;
  const overdue = !paid && expense.next_due_date < today;

  return (
    <Card className="p-4 sm:p-4">
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

      <div className="mt-3 flex flex-wrap gap-2">
        {!paid ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await fetch(`/api/expenses/${expense.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ last_paid_date: expense.next_due_date }),
              });
              setBusy(false);
              router.refresh();
            }}
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
    </Card>
  );
}
