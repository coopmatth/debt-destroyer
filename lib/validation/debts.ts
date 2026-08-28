import { z } from "zod";

/**
 * Validation for hand-entered debts. Shared by the API routes and the Phase 4
 * forms so the rules are stated once.
 *
 * These sit on top of the database CHECK constraints rather than replacing
 * them: the constraints are the guarantee, this layer is what produces a
 * readable message instead of a Postgres error string.
 */

export const DEBT_KINDS = [
  "credit_card",
  "student_loan",
  "auto_loan",
  "personal_loan",
  "mortgage",
  "other",
] as const;

/** YYYY-MM-DD that is also a real calendar date — "2026-02-31" must not pass. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Not a real date");

const centsAmount = z
  .number()
  .int("Amounts are in whole cents")
  .min(0, "Cannot be negative")
  .max(100_000_000_00, "That is over $100,000,000 — check the amount");

export const createDebtSchema = z.object({
  name: z.string().trim().min(1, "Give the debt a name").max(120),
  kind: z.enum(DEBT_KINDS).default("credit_card"),

  current_balance_cents: centsAmount,

  // Percentage, not a fraction: 24.99 means 24.99%. numeric(6,4) in Postgres.
  apr: z
    .number()
    .min(0, "APR cannot be negative")
    .max(100, "APR above 100% is almost certainly a typo")
    // numeric(6,4) holds 4 decimal places; anything finer would be silently
    // rounded by Postgres, so reject it here where we can say why.
    .refine(
      (value) => Math.abs(value * 10_000 - Math.round(value * 10_000)) < 1e-6,
      "APR supports at most 4 decimal places",
    ),

  minimum_payment_cents: centsAmount,
  next_due_date: isoDate.nullable().optional(),

  credit_limit_cents: centsAmount.nullable().optional(),
  statement_balance_cents: centsAmount.nullable().optional(),
})
  .refine(
    (debt) =>
      debt.credit_limit_cents == null ||
      debt.credit_limit_cents === 0 ||
      debt.current_balance_cents <= debt.credit_limit_cents,
    {
      message: "Balance is higher than the credit limit — check both numbers",
      path: ["current_balance_cents"],
    },
  )
  .refine(
    (debt) =>
      debt.current_balance_cents === 0 ||
      debt.minimum_payment_cents <= debt.current_balance_cents,
    {
      message: "Minimum payment is larger than the balance",
      path: ["minimum_payment_cents"],
    },
  );

export const updateDebtSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(DEBT_KINDS),
    current_balance_cents: centsAmount,
    apr: z.number().min(0).max(100),
    minimum_payment_cents: centsAmount,
    next_due_date: isoDate.nullable(),
    credit_limit_cents: centsAmount.nullable(),
    statement_balance_cents: centsAmount.nullable(),
    is_overdue: z.boolean(),
    is_active: z.boolean(),

    /**
     * The due date whose minimum the user is confirming paid. The engine treats
     * the minimum as met only when this equals the debt's current next_due_date,
     * so a value left over from a previous cycle fails closed.
     */
    min_payment_paid_for_due_date: isoDate.nullable(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "No fields to update");

export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type UpdateDebtInput = z.infer<typeof updateDebtSchema>;
