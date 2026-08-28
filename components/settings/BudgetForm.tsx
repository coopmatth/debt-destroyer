"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { dollarsToCents } from "@/lib/money";

interface Settings {
  weekly_variable_budget_cents: number;
  min_cash_buffer_cents: number;
  pay_frequency: string;
  next_payday: string | null;
  timezone: string;
}

export function BudgetForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      weekly_variable_budget_cents: dollarsToCents(Number(form.get("budget") ?? 0)) ?? 0,
      min_cash_buffer_cents: dollarsToCents(Number(form.get("floor") ?? 0)) ?? 0,
      pay_frequency: String(form.get("pay_frequency") ?? "biweekly"),
      next_payday: String(form.get("next_payday") ?? "") || null,
      timezone: String(form.get("timezone") ?? "UTC"),
    };

    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setBusy(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not save.");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Weekly spending budget ($)"
          hint="Groceries, gas, everyday spending. Whatever you have not spent yet is held back."
        >
          <Input
            name="budget"
            type="number"
            step="0.01"
            min="0"
            defaultValue={(settings.weekly_variable_budget_cents / 100).toFixed(2)}
          />
        </Field>

        <Field
          label="Cash floor ($)"
          hint="Never recommended for a strike, whatever the math says."
        >
          <Input
            name="floor"
            type="number"
            step="0.01"
            min="0"
            defaultValue={(settings.min_cash_buffer_cents / 100).toFixed(2)}
          />
        </Field>

        <Field label="Paid every">
          <Select name="pay_frequency" defaultValue={settings.pay_frequency}>
            <option value="weekly">Week</option>
            <option value="biweekly">Two weeks</option>
            <option value="semimonthly">Twice a month</option>
            <option value="monthly">Month</option>
          </Select>
        </Field>

        <Field
          label="Next payday"
          hint="Set it once — it rolls forward on its own from here."
        >
          <Input name="next_payday" type="date" defaultValue={settings.next_payday ?? ""} />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Timezone" hint="Decides when your week rolls over.">
            <Input name="timezone" defaultValue={settings.timezone} placeholder="America/New_York" />
          </Field>
        </div>

        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </Button>
          {saved ? <span className="text-sm text-good">Saved</span> : null}
          {error ? (
            <span className="text-sm text-critical" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
