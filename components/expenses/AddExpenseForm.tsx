"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { dollarsToCents } from "@/lib/money";

export function AddExpenseForm({ onSuccess }: { onSuccess: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        amount_cents: dollarsToCents(Number(amount)) ?? 0,
        next_due_date: dueDate || null,
        frequency: "monthly",
        category: "utilities",
        is_essential: true,
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
          <span className="text-[10px] text-ink-secondary uppercase">Amount ($)</span>
          <input required type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded border border-hairline bg-surface-2 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-ink-secondary uppercase">Due Date</span>
          <input required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded border border-hairline bg-surface-2 px-3 py-2 text-sm" />
        </label>
      </div>
      <Button type="submit" variant="primary" disabled={busy} className="mt-2 w-full">
        {busy ? "Saving..." : "Add Bill"}
      </Button>
    </form>
  );
}
