import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { computeWeeklyPlan, type ComputeOptions } from "@/lib/engine";
import { startOfWeekMonday, todayInTimezone } from "@/lib/engine/dates";
import type { WeeklyPlan, WeeklyPlanInput } from "@/lib/engine/types";

type Client = SupabaseClient<Database>;

/**
 * The impure shell around the pure engine: read rows, map them to plain engine
 * inputs, compute, persist.
 *
 * Everything here is I/O and mapping. No arithmetic — if a number is being
 * decided, it belongs in the engine where it can be tested.
 *
 * Every query filters on user_id explicitly rather than leaning on RLS. The
 * write path has to use the service role (debt_strikes has no client INSERT
 * policy, by design), and under that client RLS is off — an unfiltered read
 * would quietly load every user's accounts into one person's plan.
 */

export async function loadPlanInput(
  db: Client,
  userId: string,
  options: ComputeOptions = {},
): Promise<WeeklyPlanInput> {
  const { data: user, error: userError } = await db
    .from("users")
    .select(
      "preferred_strategy, weekly_variable_budget_cents, min_cash_buffer_cents, pay_frequency, next_payday, timezone",
    )
    .eq("id", userId)
    .single();

  if (userError || !user) {
    throw new Error(`Could not load settings for user: ${userError?.message ?? "no row"}`);
  }

  const timezone = user.timezone;
  const today = todayInTimezone(timezone, options.now ?? new Date());
  const weekStart = startOfWeekMonday(today);

  const [accountsResult, debtsResult, expensesResult, transactionsResult] =
    await Promise.all([
      db
        .from("accounts")
        .select("id, name, available_balance_cents, current_balance_cents, is_liquid")
        .eq("user_id", userId)
        .eq("is_active", true),
      db
        .from("debts")
        .select(
          "id, name, current_balance_cents, apr, minimum_payment_cents, next_due_date, min_payment_paid_for_due_date",
        )
        .eq("user_id", userId)
        .eq("is_active", true),
      db
        .from("expenses")
        .select(
          "id, name, category, amount_cents, frequency, next_due_date, last_paid_date, is_essential",
        )
        .eq("user_id", userId)
        .eq("is_active", true),
      // Only this week's spending is needed; the engine does not filter by date.
      db
        .from("transactions")
        .select("amount_cents, date, is_transfer")
        .eq("user_id", userId)
        .gte("date", weekStart)
        .lte("date", today),
    ]);

  for (const result of [accountsResult, debtsResult, expensesResult, transactionsResult]) {
    if (result.error) throw new Error(`Engine input query failed: ${result.error.message}`);
  }

  return {
    settings: {
      strategy: user.preferred_strategy,
      weeklyVariableBudgetCents: user.weekly_variable_budget_cents,
      minCashBufferCents: user.min_cash_buffer_cents,
      payFrequency: user.pay_frequency,
      nextPayday: user.next_payday,
      timezone,
    },
    accounts: (accountsResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      availableCents: row.available_balance_cents,
      currentCents: row.current_balance_cents,
      // Generated column; null only if the expression could not be evaluated.
      isLiquid: row.is_liquid ?? false,
    })),
    debts: (debtsResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      balanceCents: row.current_balance_cents,
      aprPercent: row.apr,
      minimumPaymentCents: row.minimum_payment_cents,
      nextDueDate: row.next_due_date,
      minPaymentPaidForDueDate: row.min_payment_paid_for_due_date,
    })),
    expenses: (expensesResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      amountCents: row.amount_cents,
      frequency: row.frequency,
      nextDueDate: row.next_due_date,
      lastPaidDate: row.last_paid_date,
      isEssential: row.is_essential,
    })),
    transactions: (transactionsResult.data ?? []).map((row) => ({
      amountCents: row.amount_cents,
      date: row.date,
      isTransfer: row.is_transfer,
    })),
  };
}

/**
 * Computes this week's plan and stores it.
 *
 * Upserting on `(user_id, week_start)` makes a recompute idempotent: running it
 * three times on a Wednesday leaves one row, updated in place, rather than
 * three competing recommendations for the same week.
 *
 * A strike the user has already acted on is not overwritten — once money has
 * moved, the record of what was recommended has to stay put.
 */
export async function computeAndStoreWeeklyPlan(
  db: Client,
  userId: string,
  options: ComputeOptions = {},
): Promise<{ plan: WeeklyPlan; persisted: boolean }> {
  const input = await loadPlanInput(db, userId, options);
  const plan = computeWeeklyPlan(input, options);

  const { data: existing } = await db
    .from("debt_strikes")
    .select("id, status")
    .eq("user_id", userId)
    .eq("week_start", plan.weekStart)
    .maybeSingle();

  if (existing && (existing.status === "paid" || existing.status === "accepted")) {
    return { plan, persisted: false };
  }

  const { error } = await db.from("debt_strikes").upsert(
    {
      user_id: userId,
      week_start: plan.weekStart,
      strategy: plan.strategy,
      engine_version: plan.engineVersion,
      next_payday: plan.nextPayday,

      liquid_cash_cents: plan.liquidCashCents,
      fixed_expenses_cents: plan.fixedExpensesCents,
      variable_expenses_cents: plan.variableRemainingCents,
      minimums_reserved_cents: plan.minimumsReservedCents,
      buffer_floor_cents: plan.bufferFloorCents,

      safe_to_spend_cents: plan.safeToSpendCents,
      recommended_amount_cents: plan.recommendedStrikeCents,
      shortfall_cents: plan.shortfallCents,
      target_debt_id: plan.targetDebtId,
      status: "recommended",
      computed_at: new Date().toISOString(),

      // Everything needed to explain the number back to the user later.
      breakdown: asJson({
        engineVersion: plan.engineVersion,
        today: plan.today,
        daysUntilPayday: plan.daysUntilPayday,
        variableBudgetCents: plan.variableBudgetCents,
        variableSpentCents: plan.variableSpentCents,
        fixedExpenseCharges: plan.fixedExpenseCharges,
        minimumReservations: plan.minimumReservations,
        rankedDebts: plan.rankedDebts,
        actions: plan.actions,
        blockers: plan.blockers,
        notes: plan.notes,
      }),
    },
    { onConflict: "user_id,week_start" },
  );

  if (error) throw new Error(`Failed to persist weekly strike: ${error.message}`);

  return { plan, persisted: true };
}

/**
 * Supabase types a jsonb column as `Json`, which requires an index signature
 * that our named interfaces deliberately do not have. The values here are plain
 * data — arrays, numbers, strings — so the shape is already valid JSON; this
 * just tells the compiler so without stringify/parse round-tripping.
 */
function asJson<T>(value: T): Json {
  return value as unknown as Json;
}
