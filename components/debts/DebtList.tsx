"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { formatApr, formatCents, formatDueDate } from "@/lib/format";
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
    <div className="grid grid-cols-2 gap-3 items-start">
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
            <span className="text-[10px] text-ink-secondary uppercase">Balance ($)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              className="w-full rounded border border-hairline bg-surface-2 px-2 py-1 text-xs"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-ink-secondary uppercase">Minimum ($)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={minimum}
              onChange={(e) => setMinimum(e.target.value)}
              className="w-full rounded border border-hairline bg-surface-2 px-2 py-1 text-xs"
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
              disabled={busy}
              className="w-full"
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
            <Button size="sm" variant="ghost" className="w-full" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div>
            <h3 className="font-semibold text-ink truncate leading-tight">{debt.name}</h3>
            <p className="text-[10px] text-ink-muted uppercase tracking-wide mt-0.5">
              {formatApr(debt.apr)} APR
            </p>
            <div className="my-3">
              <span className="text-xl font-bold tabular text-ink block leading-none">
                {formatCents(debt.current_balance_cents)}
              </span>
              <span className="text-[10px] text-ink-secondary block mt-1">
                Min {formatCents(debt.minimum_payment_cents)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {minimumMet ? <Badge tone="good">✓ Min paid</Badge> : null}
              {overdue ? <Badge tone="critical">▲ Overdue</Badge> : null}
            </div>
            <p className="text-[10px] text-ink-muted leading-snug">
              Due {debt.next_due_date ? formatDueDate(debt.next_due_date, today) : "Not set"}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-1.5 pt-3 border-t border-hairline">
            {debt.next_due_date && !minimumMet ? (
              <Button
                size="sm"
                variant="primary"
                className="w-full"
                disabled={busy}
                onClick={() => patch({ min_payment_paid_for_due_date: debt.next_due_date })}
              >
                Pay Min
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
