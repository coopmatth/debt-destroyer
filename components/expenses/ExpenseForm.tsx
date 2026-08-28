"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { EXPENSE_CATEGORIES, EXPENSE_FREQUENCIES } from "@/lib/validation/expenses";
import { dollarsToCents } from "@/lib/money";
import { titleCase } from "@/lib/format";

export function ExpenseForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrors({});

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      category: String(form.get("category") ?? "other"),
      amount_cents: dollarsToCents(Number(form.get("amount") ?? 0)) ?? 0,
      frequency: String(form.get("frequency") ?? "monthly"),
      next_due_date: String(form.get("next_due_date") ?? ""),
      is_essential: form.get("is_essential") === "on",
    };

    const response = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setBusy(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setErrors(body.issues ?? { name: [body.error ?? "Could not save."] });
      return;
    }

    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Name" error={errors.name?.[0]}>
            <Input name="name" placeholder="Rent" required maxLength={120} />
          </Field>
        </div>

        <Field label="Category">
          <Select name="category" defaultValue="housing">
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {titleCase(category)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Amount ($)" error={errors.amount_cents?.[0]}>
          <Input name="amount" type="number" step="0.01" min="0.01" placeholder="1800.00" required />
        </Field>

        <Field label="How often">
          <Select name="frequency" defaultValue="monthly">
            {EXPENSE_FREQUENCIES.map((frequency) => (
              <option key={frequency} value={frequency}>
                {titleCase(frequency)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Next due date"
          hint="Recurring bills roll forward from here"
          error={errors.next_due_date?.[0]}
        >
          <Input name="next_due_date" type="date" required />
        </Field>

        <div className="sm:col-span-2 flex items-center gap-2">
          <input
            id="is_essential"
            name="is_essential"
            type="checkbox"
            defaultChecked
            className="size-4 rounded border-hairline"
          />
          <label htmlFor="is_essential" className="text-sm text-ink-secondary">
            Essential — always reserved before any strike
          </label>
        </div>

        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Add bill"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
