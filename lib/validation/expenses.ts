import { z } from "zod";

/** Validation for hand-entered bills and recurring expenses. */

export const EXPENSE_FREQUENCIES = [
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "quarterly",
  "annual",
  "one_time",
] as const;

/** Suggested categories. Free text is allowed — the column is not an enum. */
export const EXPENSE_CATEGORIES = [
  "housing",
  "utilities",
  "insurance",
  "transportation",
  "subscription",
  "childcare",
  "healthcare",
  "groceries",
  "debt_service",
  "other",
] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Not a real date");

export const createExpenseSchema = z.object({
  name: z.string().trim().min(1, "Give the bill a name").max(120),
  category: z.string().trim().min(1, "Pick a category").max(60),

  amount_cents: z
    .number()
    .int("Amounts are in whole cents")
    .positive("A bill must be more than zero")
    .max(100_000_000_00),

  frequency: z.enum(EXPENSE_FREQUENCIES),
  next_due_date: isoDate,

  /**
   * Essential bills are always reserved out of liquid cash. Non-essential ones
   * are still counted, but the dashboard can surface them as "cut this to
   * strike harder".
   */
  is_essential: z.boolean().default(true),
});

export const updateExpenseSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(60),
    amount_cents: z.number().int().positive().max(100_000_000_00),
    frequency: z.enum(EXPENSE_FREQUENCIES),
    next_due_date: isoDate,
    is_essential: z.boolean(),
    is_active: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "No fields to update");

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
