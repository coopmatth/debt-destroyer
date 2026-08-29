import {
  addDays,
  isWithin,
  occurrencesInWindow,
  type IsoDate,
} from "@/lib/engine/dates";
import type {
  EngineAccount,
  EngineDebt,
  EngineExpense,
  EngineTransaction,
  ExpenseCharge,
  MinimumReservation,
} from "@/lib/engine/types";

/**
 * The cash-flow half of the engine: how much money is really available, and
 * what is already spoken for before the next paycheck arrives.
 */

/**
 * How long a passed due date keeps reserving money.
 *
 * This window exists because due dates are hand-maintained. Rent due on the 1st
 * is almost always paid on the 1st, but `next_due_date` still says the 1st
 * until the user updates it. Reserving it for the rest of the month would make
 * every recommendation too small, all month — the engine would look broken.
 *
 * Seven days is short enough that a paid bill stops distorting the number
 * quickly, and long enough to cover a bill that genuinely has not been paid yet.
 * Past the window the charge is dropped from the reservation and surfaced as a
 * blocker instead, so it gets attention rather than silently skewing the math.
 */
export const OVERDUE_GRACE_DAYS = 7;

/**
 * Total Liquid Cash across checking and savings.
 *
 * Uses `available` in preference to `current` because available already nets
 * out pending holds — the debit card swipe from an hour ago that has not
 * posted. Spending against `current` is how people overdraw.
 */
export function totalLiquidCash(accounts: EngineAccount[]): {
  cents: number;
  usedCurrentFallback: string[];
} {
  let cents = 0;
  const usedCurrentFallback: string[] = [];

  for (const account of accounts) {
    if (!account.isLiquid) continue;

    if (account.availableCents !== null) {
      cents += account.availableCents;
    } else if (account.currentCents !== null) {
      cents += account.currentCents;
      usedCurrentFallback.push(account.name);
    }
  }

  return { cents, usedCurrentFallback };
}

export interface FixedExpenseResult {
  charges: ExpenseCharge[];
  totalCents: number;
  /** Bills past the grace window: dropped from the math, raised to the user. */
  lapsedExpenses: string[];
}

/**
 * Bills falling due between now and the next payday.
 *
 * A recurring bill can land more than once in the window — a weekly expense
 * genuinely hits twice before a fortnightly payday — so this returns every
 * occurrence rather than one charge per bill. Treating each expense as a single
 * charge would under-reserve exactly the users living closest to the line.
 */
export function fixedExpensesDueBefore(
  expenses: EngineExpense[],
  today: IsoDate,
  payday: IsoDate,
): FixedExpenseResult {
  const graceStart = addDays(today, -OVERDUE_GRACE_DAYS);
  const charges: ExpenseCharge[] = [];
  const lapsedExpenses: string[] = [];

  for (const expense of expenses) {
    const occurrences = occurrencesInWindow(
      expense.nextDueDate,
      expense.frequency,
      graceStart,
      payday,
    );

    // Nothing in the window and the stored date is behind the grace window:
    // either a one-time bill that was never cleared, or a date the user has let
    // rot. Do not reserve for it, but do not swallow it silently either.
    if (occurrences.length === 0 && expense.nextDueDate < graceStart) {
      lapsedExpenses.push(expense.name);
      continue;
    }

    for (const dueDate of occurrences) {
      // The user has confirmed this occurrence is paid.
      if (expense.lastPaidDate !== null && dueDate <= expense.lastPaidDate) continue;

      charges.push({
        expenseId: expense.id,
        name: expense.name,
        category: expense.category,
        dueDate,
        amountCents: expense.amountCents,
        isOverdue: dueDate < today,
        isEssential: expense.isEssential,
      });
    }
  }

  charges.sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name),
  );

  return {
    charges,
    totalCents: charges.reduce((sum, c) => sum + c.amountCents, 0),
    lapsedExpenses,
  };
}

/**
 * What the user has already spent on variable living costs since Monday.
 *
 * Transfers and loan payments are excluded upstream (`is_transfer`), so paying
 * a credit card does not read as groceries. Pending charges count, which keeps
 * this consistent with the `available` balance used for liquid cash: both
 * reflect the same money already being gone.
 */
export function variableSpendThisWeek(
  transactions: EngineTransaction[],
  weekStart: IsoDate,
  today: IsoDate,
): number {
  let cents = 0;

  for (const transaction of transactions) {
    if (transaction.isTransfer) continue;
    // Negative amounts are refunds and inflows; they do not consume the budget.
    if (transaction.amountCents <= 0) continue;
    if (!isWithin(transaction.date, weekStart, today)) continue;

    cents += transaction.amountCents;
  }

  return cents;
}

/**
 * Budget still to be spent this week.
 *
 * The subtraction is the point: money already spent has already left the
 * account, so it is visible in the liquid balance. Reserving the full weekly
 * budget on top of that charges the user twice for the same groceries and
 * shrinks every recommendation late in the week.
 */
export function variableRemaining(budgetCents: number, spentCents: number): number {
  return Math.max(0, budgetCents - spentCents);
}

export interface MinimumsResult {
  reservations: MinimumReservation[];
  totalCents: number;
  /** Minimums past the grace window — a probable missed payment. */
  lapsedMinimums: string[];
}

/**
 * Minimum payments that must be set aside before any money counts as "extra".
 *
 * A minimum counts as met only when the confirmation matches the *current* due
 * date, which is what makes the check expire on its own: once the cycle rolls
 * over, last month's confirmation no longer matches and the minimum is reserved
 * again. A missing or mismatched value fails closed.
 */
export function minimumsToReserve(
  debts: EngineDebt[],
  today: IsoDate,
  payday: IsoDate,
): MinimumsResult {
  const graceStart = addDays(today, -OVERDUE_GRACE_DAYS);
  const reservations: MinimumReservation[] = [];
  const lapsedMinimums: string[] = [];

  for (const debt of debts) {
    if (debt.minimumPaymentCents <= 0) continue;
    if (debt.balanceCents <= 0) continue;

    const paidForThisCycle =
      debt.nextDueDate !== null && debt.minPaymentPaidForDueDate === debt.nextDueDate;
    if (paidForThisCycle) continue;

    // Never pay more than the balance: a $35 minimum on a $12 balance is $12.
    const amountCents = Math.min(debt.minimumPaymentCents, debt.balanceCents);

    // No due date recorded — reserve it anyway. Assuming nothing is owed is the
    // failure that costs a late fee.
    if (debt.nextDueDate === null) {
      reservations.push({
        debtId: debt.id,
        name: debt.name,
        dueDate: null,
        amountCents,
        isOverdue: false,
      });
      continue;
    }

    if (debt.nextDueDate > payday) continue; // the next paycheck covers it

    if (debt.nextDueDate < graceStart) {
      lapsedMinimums.push(debt.name);
      continue;
    }

    reservations.push({
      debtId: debt.id,
      name: debt.name,
      dueDate: debt.nextDueDate,
      amountCents,
      isOverdue: debt.nextDueDate < today,
    });
  }

  reservations.sort(
    (a, b) =>
      (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
      a.name.localeCompare(b.name),
  );

  return {
    reservations,
    totalCents: reservations.reduce((sum, r) => sum + r.amountCents, 0),
    lapsedMinimums,
  };
}

export function calculateDynamicBudget(
  transactions: EngineTransaction[],
  hardCeilingCents: number,
  today: IsoDate
): number {
  const windowStart = addDays(today, -30);
  const recentSpend = transactions
    .filter((t) => !t.isTransfer && t.amountCents > 0 && t.date >= windowStart)
    .reduce((sum, t) => sum + t.amountCents, 0);

  // Average weekly spend over the last month
  const rollingWeeklyAvg = Math.round(recentSpend / 4.33);
  
  // Clamp to never exceed the user's safety ceiling
  return Math.min(rollingWeeklyAvg, hardCeilingCents);
}
