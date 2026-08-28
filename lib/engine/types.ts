import type { ExpenseFrequency, IsoDate, PayFrequency } from "@/lib/engine/dates";

/**
 * Engine-facing shapes. Deliberately not the database row types: the engine
 * takes plain data so it can be exercised from fixtures, and so a schema change
 * shows up as a compile error in one mapping function rather than silently
 * changing what the algorithm computes.
 */

export type Strategy = "avalanche" | "snowball";

export interface EngineAccount {
  id: string;
  name: string;
  /** Reflects pending holds; preferred over current when the bank reports it. */
  availableCents: number | null;
  currentCents: number | null;
  isLiquid: boolean;
}

export interface EngineDebt {
  id: string;
  name: string;
  balanceCents: number;
  /** Percentage, not a fraction: 24.99 means 24.99%. */
  aprPercent: number;
  minimumPaymentCents: number;
  nextDueDate: IsoDate | null;
  /** The due date whose minimum the user confirmed paid, if any. */
  minPaymentPaidForDueDate: IsoDate | null;
}

export interface EngineExpense {
  id: string;
  name: string;
  category: string;
  amountCents: number;
  frequency: ExpenseFrequency;
  nextDueDate: IsoDate;
  /** Set when the user marks the current occurrence paid. */
  lastPaidDate: IsoDate | null;
  isEssential: boolean;
}

export interface EngineTransaction {
  /** Plaid's sign convention: positive means money left the account. */
  amountCents: number;
  date: IsoDate;
  isTransfer: boolean;
}

export interface EngineSettings {
  strategy: Strategy;
  weeklyVariableBudgetCents: number;
  minCashBufferCents: number;
  payFrequency: PayFrequency;
  nextPayday: IsoDate | null;
  timezone: string;
}

export interface WeeklyPlanInput {
  settings: EngineSettings;
  accounts: EngineAccount[];
  debts: EngineDebt[];
  expenses: EngineExpense[];
  /** Transactions from the current week only; the engine does not filter by date. */
  transactions: EngineTransaction[];
}

export interface ExpenseCharge {
  expenseId: string;
  name: string;
  category: string;
  dueDate: IsoDate;
  amountCents: number;
  isOverdue: boolean;
  isEssential: boolean;
}

export interface MinimumReservation {
  debtId: string;
  name: string;
  dueDate: IsoDate | null;
  amountCents: number;
  isOverdue: boolean;
}

export interface RankedDebt {
  debtId: string;
  name: string;
  balanceCents: number;
  aprPercent: number;
  rank: number;
  /** Annualized cost of carrying this balance — what the ranking is protecting. */
  annualInterestCents: number;
}

/** A concrete "move this much money here" instruction. */
export interface PlannedAction {
  type: "minimum" | "strike";
  debtId: string;
  debtName: string;
  amountCents: number;
  reason: string;
}

export type BlockerCode =
  | "no_linked_accounts"
  | "no_active_debts"
  | "no_payday_set"
  | "overdue_minimum"
  | "negative_buffer"
  | "stale_expense_dates";

export interface Blocker {
  code: BlockerCode;
  message: string;
}

export interface WeeklyPlan {
  engineVersion: number;
  today: IsoDate;
  weekStart: IsoDate;
  nextPayday: IsoDate;
  daysUntilPayday: number;
  strategy: Strategy;

  // Inputs to the buffer calculation, each retained so the UI can show its work.
  liquidCashCents: number;
  fixedExpensesCents: number;
  fixedExpenseCharges: ExpenseCharge[];
  variableBudgetCents: number;
  variableSpentCents: number;
  variableRemainingCents: number;
  minimumsReservedCents: number;
  minimumReservations: MinimumReservation[];
  bufferFloorCents: number;

  /** Total Liquid Cash − (fixed + variable remaining + minimums + floor). May be negative. */
  safeToSpendCents: number;
  /** The Weekly Debt Strike: safe-to-spend, floored at zero and rounded down to whole dollars. */
  recommendedStrikeCents: number;
  /** How far underwater the week is, when safe-to-spend is negative. */
  shortfallCents: number;

  targetDebtId: string | null;
  targetDebtName: string | null;
  rankedDebts: RankedDebt[];
  actions: PlannedAction[];
  blockers: Blocker[];
  notes: string[];
}
