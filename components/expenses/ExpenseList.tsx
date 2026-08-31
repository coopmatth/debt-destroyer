"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { formatCents } from "@/lib/format";
import { dollarsToCents } from "@/lib/money";
import { parseIsoDate, advanceExpensePeriod, type ExpenseFrequency } from "@/lib/engine/dates";
import type { Tables } from "@/types/database.types";
import { AddExpenseForm } from "@/components/expenses/AddExpenseForm";

type Expense = Tables<"expenses">;

export function ExpenseList({ expenses, today }: { expenses: Expense[]; today: string }) {
  const [showAddModal, setShowAddModal] = useState(false);

  // Sort bills chronologically
  const sortedExpenses = [...expenses].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));

  // Group bills by month and year
  const grouped = sortedExpenses.reduce((acc, expense) => {
    const dateObj = parseIsoDate(expense.next_due_date);
    const monthYear = dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    if (!acc[monthYear]) acc[monthYear] = [];
    acc[monthYear].push(expense);
    return acc;
  }, {} as Record<string, Expense[]>);

  return (
    <div className="flex flex-col gap-4">
      <Button 
        variant="primary" 
        className="w-full sm:w-auto self-start bg-blue-600 hover:bg-blue-700 text-white"
        onClick={() => setShowAddModal(true)}
      >
        + Add a Bill
      </Button>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-page rounded-xl shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-ink-muted hover:text-ink text-xl leading-none"
            >
              ✕
            </button>
            <div className="p-6">
              <h2 className="text-lg font-bold mb-4 text-ink">Add New Bill</h2>
              <AddExpenseForm onSuccess={() => setShowAddModal(false)} />
            </div>
          </div>
        </div>
      )}

      {expenses.length === 0 ? (
        <EmptyState title="No bills yet">
          Add the recurring costs due before your next payday.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(grouped).map(([month, monthExpenses]) => (
            <div key={month} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold tracking-wide text-ink-secondary uppercase ml-1">
                {month}
              </h3>
              {monthExpenses.map((expense) => (
                <ExpenseRow key={expense.id} expense={expense} today={today} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpenseRow({ expense, today }: { expense: Expense; today: string }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState(expense.name);
  const [amount, setAmount] = useState((expense.amount_cents / 100).toFixed(2));
  const [dueDate, setDueDate] = useState(expense.next_due_date);

  // Sync local edit state if the server pushes a new date down
  useEffect(() => {
    setName(expense.name);
    setAmount((expense.amount_cents / 100).toFixed(2));
    setDueDate(expense.next_due_date);
  }, [expense]);

  const paid = expense.last_paid_date !== null && expense.last_paid_date >= expense.next_due_date;
  const overdue = !paid && expense.next_due_date < today;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/expenses/${expense.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    router.refresh();
  }

  async function handleMarkPaid() {
    // Advance to the exact next cycle based on frequency (e.g., next month, next week)
    const nextCycleDate = advanceExpensePeriod(expense.next_due_date, expense.frequency as ExpenseFrequency);
    
    await patch({ 
      last_paid_date: expense.next_due_date,
      ...(nextCycleDate ? { next_due_date: nextCycleDate } : {})
    });
    
    // Automatically close the expanded row when it flies down to the next month
    setExpanded(false); 
  }

  return (
    <Card className="flex flex-col p-0 overflow-hidden">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between p-4 w-full text-left hover:bg-surface-2 transition"
      >
        <div className="flex flex-col">
          <span className="font-semibold text-ink">{expense.name}</span>
          <span className="text-xs text-ink-muted">Due {parseIsoDate(expense.next_due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>
        </div>
        <div className="flex items-center gap-3">
          {paid ? <Badge tone="good">✓</Badge> : null}
          {overdue ? <Badge tone="critical">!</Badge> : null}
          <span className="text-lg font-bold tabular text-ink">
            {formatCents(expense.amount_cents)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="p-4 border-t border-hairline bg-surface/30 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5 col-span-2">
              <span className="text-[10px] text-ink-secondary uppercase">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-hairline bg-surface-2 px-2 py-1 text-sm"
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
                className="w-full rounded border border-hairline bg-surface-2 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-ink-secondary uppercase">Due Date</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded border border-hairline bg-surface-2 px-2 py-1 text-sm"
              />
            </label>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5 pt-2 border-t border-hairline">
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => patch({
                name: name.trim(),
                amount_cents: dollarsToCents(Number(amount)) ?? 0,
                next_due_date: dueDate,
              })}
            >
              Save
            </Button>
            {!paid ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={handleMarkPaid}
              >
                Mark Paid
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
