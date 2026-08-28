import { describe, expect, it } from "vitest";
import { createDebtSchema, updateDebtSchema } from "@/lib/validation/debts";
import { createExpenseSchema } from "@/lib/validation/expenses";

const validDebt = {
  name: "Chase Sapphire",
  kind: "credit_card" as const,
  current_balance_cents: 310025,
  apr: 24.99,
  minimum_payment_cents: 3500,
  next_due_date: "2026-09-02",
};

describe("createDebtSchema", () => {
  it("accepts a well-formed debt", () => {
    const result = createDebtSchema.safeParse(validDebt);
    expect(result.success).toBe(true);
  });

  it("defaults kind so a minimal form still works", () => {
    const { kind, ...withoutKind } = validDebt;
    void kind;
    const result = createDebtSchema.safeParse(withoutKind);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe("credit_card");
  });

  it("rejects an APR entered as a fraction", () => {
    // Someone typing 0.2499 meaning 24.99% is a real mistake, but it is
    // indistinguishable from a genuine 0.2499% promo rate — so we can only
    // catch the unambiguous direction: values above 100.
    const result = createDebtSchema.safeParse({ ...validDebt, apr: 2499 });
    expect(result.success).toBe(false);
  });

  it("rejects negative APR and negative balances", () => {
    expect(createDebtSchema.safeParse({ ...validDebt, apr: -1 }).success).toBe(false);
    expect(
      createDebtSchema.safeParse({ ...validDebt, current_balance_cents: -100 }).success,
    ).toBe(false);
  });

  it("holds APR to the 4 decimal places the column stores", () => {
    expect(createDebtSchema.safeParse({ ...validDebt, apr: 24.9999 }).success).toBe(true);
    expect(createDebtSchema.safeParse({ ...validDebt, apr: 24.99999 }).success).toBe(false);
  });

  it("rejects fractional cents", () => {
    const result = createDebtSchema.safeParse({
      ...validDebt,
      current_balance_cents: 310025.5,
    });
    expect(result.success).toBe(false);
  });

  it("catches a minimum payment larger than the balance", () => {
    const result = createDebtSchema.safeParse({
      ...validDebt,
      current_balance_cents: 5000,
      minimum_payment_cents: 9000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["minimum_payment_cents"]);
    }
  });

  it("catches a balance above the stated credit limit", () => {
    const result = createDebtSchema.safeParse({
      ...validDebt,
      current_balance_cents: 600000,
      credit_limit_cents: 500000,
    });
    expect(result.success).toBe(false);
  });

  it("allows a paid-off debt with a zero balance", () => {
    const result = createDebtSchema.safeParse({
      ...validDebt,
      current_balance_cents: 0,
      minimum_payment_cents: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects dates that look right but do not exist", () => {
    expect(createDebtSchema.safeParse({ ...validDebt, next_due_date: "2026-02-31" }).success).toBe(
      false,
    );
    expect(createDebtSchema.safeParse({ ...validDebt, next_due_date: "09/02/2026" }).success).toBe(
      false,
    );
    expect(createDebtSchema.safeParse({ ...validDebt, next_due_date: "2026-02-28" }).success).toBe(
      true,
    );
  });
});

describe("updateDebtSchema", () => {
  it("accepts a single-field patch", () => {
    expect(updateDebtSchema.safeParse({ current_balance_cents: 250000 }).success).toBe(true);
  });

  it("rejects an empty patch", () => {
    expect(updateDebtSchema.safeParse({}).success).toBe(false);
  });

  it("accepts marking this cycle's minimum as paid", () => {
    const result = updateDebtSchema.safeParse({
      min_payment_paid_for_due_date: "2026-09-02",
    });
    expect(result.success).toBe(true);
  });
});

describe("createExpenseSchema", () => {
  const validExpense = {
    name: "Rent",
    category: "housing",
    amount_cents: 180000,
    frequency: "monthly" as const,
    next_due_date: "2026-09-01",
  };

  it("accepts a well-formed bill and defaults to essential", () => {
    const result = createExpenseSchema.safeParse(validExpense);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.is_essential).toBe(true);
  });

  it("rejects a zero or negative bill", () => {
    expect(createExpenseSchema.safeParse({ ...validExpense, amount_cents: 0 }).success).toBe(
      false,
    );
    expect(createExpenseSchema.safeParse({ ...validExpense, amount_cents: -5 }).success).toBe(
      false,
    );
  });

  it("rejects an unknown frequency", () => {
    expect(
      createExpenseSchema.safeParse({ ...validExpense, frequency: "fortnightly" }).success,
    ).toBe(false);
  });

  it("requires a due date, since the payday window depends on it", () => {
    const { next_due_date, ...withoutDate } = validExpense;
    void next_due_date;
    expect(createExpenseSchema.safeParse(withoutDate).success).toBe(false);
  });

  it("trims whitespace-only names", () => {
    expect(createExpenseSchema.safeParse({ ...validExpense, name: "   " }).success).toBe(false);
  });
});
