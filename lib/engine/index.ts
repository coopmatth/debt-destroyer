import {
  addDays,
  daysBetween,
  nextPaydayOnOrAfter,
  startOfWeekFriday,
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

export const ENGINE_VERSION = 1;

const DEFAULT_HORIZON_DAYS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  semimonthly: 15,
  monthly: 30,
};

export interface ComputeOptions {
  now?: Date;
}

export function computeWeeklyPlan(
  input: WeeklyPlanInput,
  options: ComputeOptions = {},
): WeeklyPlan {
  const { settings, accounts, debts, expenses, transactions } = input;
  const now = options.now ?? new Date();

  const today = todayInTimezone(settings.timezone, now);
  const weekStart = startOfWeekFriday(today);

  const blockers: Blocker[] = [];
  const notes: string[] = [];

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
      `Weekly spending is over budget by $${((variableSpent - settings.weeklyVariableBudgetCents) / 100).toFixed(2)}. That money is already gone, so it reduces the strike rather than the reserve.`,
    );
  }

  const minimums = minimumsToReserve(debts, today, nextPayday);
  if (minimums.lapsedMinimums.length > 0) {
    blockers.push({
      code: "overdue_minimum",
      message: `Minimum payments look missed on: ${minimums.lapsedMinimums.join(", ")}. Confirm these before striking anything.`,
    });
  }

  const safeToSpendCents =
    liquid.cents -
    fixed.totalCents -
    variableLeft -
    minimums.totalCents -
    settings.minCashBufferCents;

  const recommendedStrikeCents =
    safeToSpendCents > 0 ? Math.floor(safeToSpendCents / 100) * 100 : 0;

  const shortfallCents = safeToSpendCents < 0 ? -safeToSpendCents : 0;
  if (shortfallCents > 0) {
    blockers.push({
      code: "negative_buffer",
      message: `Committed costs exceed available cash by $${(shortfallCents / 100).toFixed(2)} before payday. No strike this week.`,
    });
  }

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
      `$${(unallocatedCents / 100).toFixed(2)} more is available than the debts can absorb — every balance would be cleared.`,
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
