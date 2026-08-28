import {
  addDays,
  daysBetween,
  nextPaydayOnOrAfter,
  startOfWeekMonday,
  todayInTimezone,
  type IsoDate,
} from "@/lib/engine/dates";
import {
  fixedExpensesDueBefore,
  minimumsToReserve,
  totalLiquidCash,
  variableRemaining,
  variableSpendThisWeek,
} from "@/lib/engine/cashflow";
import { allocateStrike, overdueMinimumActions, rankDebts } from "@/lib/engine/strategy";
import type { Blocker, WeeklyPlan, WeeklyPlanInput } from "@/lib/engine/types";

export * from "@/lib/engine/types";
export * from "@/lib/engine/dates";
export * from "@/lib/engine/cashflow";
export * from "@/lib/engine/strategy";

/** Bumped when the arithmetic changes, so stored strikes stay interpretable. */
export const ENGINE_VERSION = 1;

/** Payday horizon assumed when the user has not set one. */
const DEFAULT_HORIZON_DAYS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  semimonthly: 15,
  monthly: 30,
};

export interface ComputeOptions {
  /**
   * The clock, as an argument. Nothing in the engine calls `new Date()` on its
   * own — that is what makes "what does this recommend on the 3rd of February"
   * a test rather than a thought experiment.
   */
  now?: Date;
}

/**
 * The Debt Destroyer calculation.
 *
 *   Safe to Spend = Total Liquid Cash
 *                 − Fixed expenses due before the next payday
 *                 − Variable budget not yet spent this week
 *                 − Minimum payments not yet made
 *                 − The user's personal cash floor
 *
 *   Weekly Debt Strike = max(Safe to Spend, 0), rounded down to whole dollars
 *
 * Two additions to the original formula, both load-bearing:
 *
 * Minimums are subtracted before anything is called extra. The spec allows the
 * strike only "provided all minimum payments are met", and reserving the cash
 * is what makes that true rather than hoped for.
 *
 * The floor is subtracted last. It is the cash the user has said never to
 * recommend spending, and an engine that can drive a balance to exactly zero
 * will eventually do it the week before an unexpected bill.
 */
export function computeWeeklyPlan(
  input: WeeklyPlanInput,
  options: ComputeOptions = {},
): WeeklyPlan {
  const { settings, accounts, debts, expenses, transactions } = input;
  const now = options.now ?? new Date();

  const today = todayInTimezone(settings.timezone, now);
  const weekStart = startOfWeekMonday(today);

  const blockers: Blocker[] = [];
  const notes: string[] = [];

  // ---- Horizon -------------------------------------------------------------
  let nextPayday: IsoDate;
  if (settings.nextPayday) {
    nextPayday = nextPaydayOnOrAfter(settings.nextPayday, settings.payFrequency, today);
  } else {
    const horizon = DEFAULT_HORIZON_DAYS[settings.payFrequency] ?? 14;
    nextPayday = addDays(today, horizon);
    blockers.push({
      code: "no_payday_set",
      message: `No payday set — assuming ${horizon} days of expenses. Set your next payday for an accurate number.`,
    });
  }

  // ---- Cash ----------------------------------------------------------------
  const liquid = totalLiquidCash(accounts);
  if (liquid.usedCurrentFallback.length > 0) {
    notes.push(
      `Used current balance for ${liquid.usedCurrentFallback.join(", ")} — the bank did not report an available balance, so pending charges may not be reflected.`,
    );
  }
  if (accounts.filter((a) => a.isLiquid).length === 0) {
    blockers.push({
      code: "no_linked_accounts",
      message: "No checking or savings account linked — there is no cash balance to work from.",
    });
  }

  // ---- Committed outflows --------------------------------------------------
  const fixed = fixedExpensesDueBefore(expenses, today, nextPayday);
  if (fixed.lapsedExpenses.length > 0) {
    blockers.push({
      code: "stale_expense_dates",
      message: `These bills are past due and no longer being reserved for: ${fixed.lapsedExpenses.join(", ")}. Mark them paid or update the due date.`,
    });
  }

  const variableSpent = variableSpendThisWeek(transactions, weekStart, today);
  const variableLeft = variableRemaining(settings.weeklyVariableBudgetCents, variableSpent);
  if (variableSpent > settings.weeklyVariableBudgetCents) {
    notes.push(
      `Weekly spending is over budget by ${formatOverage(variableSpent - settings.weeklyVariableBudgetCents)}. That money is already gone, so it reduces the strike rather than the reserve.`,
    );
  }

  const minimums = minimumsToReserve(debts, today, nextPayday);
  if (minimums.lapsedMinimums.length > 0) {
    blockers.push({
      code: "overdue_minimum",
      message: `Minimum payments look missed on: ${minimums.lapsedMinimums.join(", ")}. Confirm these before striking anything.`,
    });
  }

  // ---- The buffer ----------------------------------------------------------
  const safeToSpendCents =
    liquid.cents -
    fixed.totalCents -
    variableLeft -
    minimums.totalCents -
    settings.minCashBufferCents;

  // Round down to whole dollars. Never up: rounding up would recommend money
  // the buffer does not actually cover.
  const recommendedStrikeCents =
    safeToSpendCents > 0 ? Math.floor(safeToSpendCents / 100) * 100 : 0;

  const shortfallCents = safeToSpendCents < 0 ? -safeToSpendCents : 0;
  if (shortfallCents > 0) {
    blockers.push({
      code: "negative_buffer",
      message: `Committed costs exceed available cash by ${formatOverage(shortfallCents)} before payday. No strike this week.`,
    });
  }

  // ---- Targeting -----------------------------------------------------------
  const rankedDebts = rankDebts(debts, settings.strategy);
  if (rankedDebts.length === 0) {
    blockers.push({
      code: "no_active_debts",
      message: "No debts with a balance to target.",
    });
  }

  const overdueActions = overdueMinimumActions(minimums.reservations);
  const { actions: strikeActions, unallocatedCents } = allocateStrike(
    rankedDebts,
    recommendedStrikeCents,
    minimums.reservations,
    settings.strategy,
  );

  if (unallocatedCents > 0 && rankedDebts.length > 0) {
    notes.push(
      `${formatOverage(unallocatedCents)} more is available than the debts can absorb — every balance would be cleared.`,
    );
  }

  const actions = [...overdueActions, ...strikeActions];
  const primaryStrike = strikeActions[0] ?? null;

  return {
    engineVersion: ENGINE_VERSION,
    today,
    weekStart,
    nextPayday,
    daysUntilPayday: daysBetween(today, nextPayday),
    strategy: settings.strategy,

    liquidCashCents: liquid.cents,
    fixedExpensesCents: fixed.totalCents,
    fixedExpenseCharges: fixed.charges,
    variableBudgetCents: settings.weeklyVariableBudgetCents,
    variableSpentCents: variableSpent,
    variableRemainingCents: variableLeft,
    minimumsReservedCents: minimums.totalCents,
    minimumReservations: minimums.reservations,
    bufferFloorCents: settings.minCashBufferCents,

    safeToSpendCents,
    // The strike is what was actually allocated: if the debts cannot absorb the
    // whole buffer, recommending the larger number would be a lie.
    recommendedStrikeCents: recommendedStrikeCents - unallocatedCents,
    shortfallCents,

    targetDebtId: primaryStrike?.debtId ?? null,
    targetDebtName: primaryStrike?.debtName ?? null,
    rankedDebts,
    actions,
    blockers,
    notes,
  };
}

function formatOverage(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
