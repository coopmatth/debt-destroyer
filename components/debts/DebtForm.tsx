"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { DEBT_KINDS } from "@/lib/validation/debts";
import { dollarsToCents } from "@/lib/money";
import { titleCase } from "@/lib/format";

/**
 * Hand-entered debt.
 *
 * The form collects dollars and converts once, at submit. The APR field shows a
 * live echo of what will be stored — the one input mistake validation cannot
 * catch is entering 0.2499 meaning 24.99%, since that is a legitimate promo
 * rate, so the fix is to make the value visible while typing.
 */
export function DebtForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [apr, setApr] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrors({});

    const form = new FormData(event.currentTarget);
    const num = (key: string) => Number(form.get(key) ?? 0);

    const payload = {
      name: String(form.get("name") ?? "").trim(),
      kind: String(form.get("kind") ?? "credit_card"),
      current_balance_cents: dollarsToCents(num("balance")) ?? 0,
      apr: num("apr"),
      minimum_payment_cents: dollarsToCents(num("minimum")) ?? 0,
      next_due_date: String(form.get("next_due_date") ?? "") || null,
      credit_limit_cents: form.get("limit") ? dollarsToCents(num("limit")) : null,
    };

    const response = await fetch("/api/debts", {
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
    setApr("");
    router.refresh();
    onDone?.();
  }

  const aprNumber = Number(apr);
  const aprEcho =
    apr !== "" && Number.isFinite(aprNumber) ? `Stored as ${aprNumber}% a year` : undefined;

  return (
    <Card>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Name" error={errors.name?.[0]}>
            <Input name="name" placeholder="Chase Sapphire" required maxLength={120} />
          </Field>
        </div>

        <Field label="Type">
          <Select name="kind" defaultValue="credit_card">
            {DEBT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {titleCase(kind)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="APR (%)"
          hint={aprEcho ?? "Enter 24.99 for 24.99%"}
          error={errors.apr?.[0]}
        >
          <Input
            name="apr"
            type="number"
            step="0.0001"
            min="0"
            max="100"
            value={apr}
            onChange={(event) => setApr(event.target.value)}
            placeholder="24.99"
            required
          />
        </Field>

        <Field label="Current balance ($)" error={errors.current_balance_cents?.[0]}>
          <Input name="balance" type="number" step="0.01" min="0" placeholder="3100.25" required />
        </Field>

        <Field label="Minimum payment ($)" error={errors.minimum_payment_cents?.[0]}>
          <Input name="minimum" type="number" step="0.01" min="0" placeholder="35.00" required />
        </Field>

        <Field
          label="Next due date"
          hint="Drives which minimums get reserved"
          error={errors.next_due_date?.[0]}
        >
          <Input name="next_due_date" type="date" />
        </Field>

        <Field label="Credit limit ($)" hint="Optional" error={errors.credit_limit_cents?.[0]}>
          <Input name="limit" type="number" step="0.01" min="0" placeholder="5000.00" />
        </Field>

        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Add debt"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
