import { z } from "zod";

/** The engine's knobs, editable by the user. */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Not a real date");

export const updateSettingsSchema = z
  .object({
    preferred_strategy: z.enum(["avalanche", "snowball"]),
    weekly_variable_budget_cents: z.number().int().min(0).max(100_000_00),
    min_cash_buffer_cents: z.number().int().min(0).max(100_000_00),
    pay_frequency: z.enum(["weekly", "biweekly", "semimonthly", "monthly"]),
    next_payday: isoDate.nullable(),
    // Validated against the runtime's own zone list rather than a hardcoded one.
    timezone: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone"),
    onboarding_completed_at: z.string().nullable(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "No fields to update");

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
