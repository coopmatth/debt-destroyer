"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { dollarsToCents } from "@/lib/money";

export function AddDebtForm({ onSuccess }: { onSuccess: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [minimum, setMinimum] = useState("");
  const [apr, setApr] = useState("");
  const [dueDate, setDueDate] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        kind: "credit_card",
        current_balance_cents: dollarsToCents(Number(balance)) ?? 0,
        minimum_payment_cents: dollarsToCents(Number(minimum)) ?? 0,
        apr: Number(apr),
        next_due_date: dueDate || null,
      }),
    });
    setBusy(false);
    router.refresh();
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-ink-secondary uppercase">Name</span>
        <input required type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-hairline bg-surface-2 px-3 py-2 text-sm" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-ink-secondary uppercase">Balance ($)</span>
          <input required type="number" step="0.01" min="0" value={balance} onChange={(e) => setBalance(e.target.value)} className="w-full rounded border border-hairline bg-surface-2 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-ink-secondary uppercase">Minimum ($)</span>
          <input required type="number" step="0.01" min="0" value={minimum} onChange={(e) => setMinimum(e.target.value)} className="w-full rounded border border-hairline bg-surface-2 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-ink-secondary uppercase">APR (%)</span>
          <input required type="number" step="0.0001" min="0" value={apr} onChange={(e) => setApr(e.target.value)} className="w-full rounded border border-hairline bg-surface-2 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-ink-secondary uppercase">Due Date</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded border border-hairline bg-surface-2 px-3 py-2 text-sm" />
        </label>
      </div>
      <Button type="submit" variant="primary" disabled={busy} className="mt-2 w-full">
        {busy ? "Saving..." : "Add Debt"}
      </Button>
    </form>
  );
}
