"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { formatApr, formatCents, formatDueDate } from "@/lib/format";
import { dollarsToCents } from "@/lib/money";
import type { Tables } from "@/types/database.types";
// Import your existing AddDebtForm component here
import { AddDebtForm } from "@/components/debts/AddDebtForm";

type Debt = Tables<"debts">;

export function DebtList({ debts, today }: { debts: Debt[]; today: string }) {
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Button 
        variant="primary" 
        className="w-full sm:w-auto self-start bg-blue-600 hover:bg-blue-700 text-white"
        onClick={() => setShowAddModal(true)}
      >
        + Add a Debt
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
              <h2 className="text-lg font-bold mb-4 text-ink">Add New Debt</h2>
              <AddDebtForm onSuccess={() => setShowAddModal(false)} />
            </div>
          </div>
        </div>
      )}

      {debts.length === 0 ? (
        <EmptyState title="No debts tracked yet">
          Add each card or loan to start your avalanche.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {debts.map((debt) => (
            <DebtRow key={debt.id} debt={debt} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}

function DebtRow({ debt, today }: { debt: Debt; today: string }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState(debt.name);
  const [balance, setBalance] = useState((debt.current_balance_cents / 100).toFixed(2));
  const [minimum, setMinimum] = useState((debt.minimum_payment_cents / 100).toFixed(2));
  const [apr, setApr] = useState(debt.apr.toString());
  const [dueDate, setDueDate] = useState(debt.next_due_date ?? "");

  const minimumMet = debt.next_due_date !== null && debt.min_payment_paid_for_due_date === debt.next_due_date;
  const overdue = debt.next_due_date !== null && debt.next_due_date < today && !minimumMet;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/debts/${debt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <Card className="flex flex-col p-0 overflow-hidden">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between p-4 w-full text-left hover:bg-surface-2 transition"
      >
        <span className="font-semibold text-ink">{debt.name}</span>
        <div className="flex items-center gap-3">
          {minimumMet ? <Badge tone="good">✓</Badge> : null}
          {overdue ? <Badge tone="critical">!</Badge> : null}
          <span className="text-lg font-bold tabular text-ink">
            {formatCents(debt.current_balance_cents)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="p-4 border-t border-hairline bg-surface/30 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-ink-secondary uppercase">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-hairline bg-surface-2 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-ink-secondary uppercase">Balance ($)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                className="w-full rounded border border-hairline bg-surface-2 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-ink-secondary uppercase">Min ($)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
                className="w-full rounded border border-hairline bg-surface-2 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-ink-secondary uppercase">APR (%)</span>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={apr}
                onChange={(e) => setApr(e.target.value)}
                className="w-full rounded border border-hairline bg-surface-2 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-0.5 col-span-2">
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
                current_balance_cents: dollarsToCents(Number(balance)) ?? 0,
                minimum_payment_cents: dollarsToCents(Number(minimum)) ?? 0,
                apr: Number(apr),
                next_due_date: dueDate || null,
              })}
            >
              Save
            </Button>
            {debt.next_due_date && !minimumMet ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => patch({ min_payment_paid_for_due_date: debt.next_due_date })}
              >
                Mark Min Paid
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
        </div>
      )}
    </Card>
  );
}
