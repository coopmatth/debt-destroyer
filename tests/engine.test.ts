import { describe, expect, it } from "vitest";
import { computeWeeklyPlan } from "@/lib/engine";
import {
  fixedExpensesDueBefore,
  minimumsToReserve,
  totalLiquidCash,
  variableRemaining,
  variableSpendThisWeek,
} from "@/lib/engine/cashflow";
import { allocateStrike, rankDebts } from "@/lib/engine/strategy";
import type {
  EngineAccount,
  EngineDebt,
  EngineExpense,
  EngineSettings,
  EngineTransaction,
  WeeklyPlanInput,
} from "@/lib/engine/types";

/**
 * Friday 2026-08-28, in a week that started Monday 2026-08-24.
 * The clock is an argument, so every scenario below is deterministic.
 */
const NOW = new Date("2026-08-28T15:00:00Z");

const settings = (overrides: Partial<EngineSettings> = {}): EngineSettings => ({
  strategy: "avalanche",
  weeklyVariableBudgetCents: 30000, // $300
  minCashBufferCents: 50000, // $500 floor
  payFrequency: "biweekly",
  nextPayday: "2026-09-11",
  timezone: "UTC",
  ...overrides,
});

const checking = (availableCents: number): EngineAccount => ({
  id: "acct-checking",
  name: "Checking",
  availableCents,
  currentCents: availableCents,
  isLiquid: true,
});

const debt = (overrides: Partial<EngineDebt> & { id: string }): EngineDebt => ({
  name: overrides.id,
  balanceCents: 100000,
  aprPercent: 20,
  minimumPaymentCents: 3500,
  nextDueDate: null,
  minPaymentPaidForDueDate: null,
  ...overrides,
});

const expense = (overrides: Partial<EngineExpense> & { id: string }): EngineExpense => ({
  name: overrides.id,
  category: "housing",
  amountCents: 100000,
  frequency: "monthly",
  nextDueDate: "2026-09-01",
  lastPaidDate: null,
  isEssential: true,
  ...overrides,
});

const input = (overrides: Partial<WeeklyPlanInput> = {}): WeeklyPlanInput => ({
  settings: settings(),
  accounts: [checking(400000)],
  debts: [],
  expenses: [],
  transactions: [],
  ...overrides,
});

// -----------------------------------------------------------------------------
// Cash flow pieces
// -----------------------------------------------------------------------------

describe("totalLiquidCash", () => {
  it("sums only liquid accounts and prefers available over current", () => {
    const result = totalLiquidCash([
      { id: "a", name: "Checking", availableCents: 120000, currentCents: 150000, isLiquid: true },
      { id: "b", name: "Savings", availableCents: null, currentCents: 500000, isLiquid: true },
      { id: "c", name: "Brokerage", availableCents: 900000, currentCents: 900000, isLiquid: false },
    ]);

    // Available ($1,200) + savings current ($5,000). The brokerage is not cash.
    expect(result.cents).toBe(620000);
    expect(result.usedCurrentFallback).toEqual(["Savings"]);
  });

  it("uses available so pending holds are not spent twice", () => {
    // $1,500 posted, $300 of it already committed to pending card swipes.
    const result = totalLiquidCash([
      { id: "a", name: "Checking", availableCents: 120000, currentCents: 150000, isLiquid: true },
    ]);
    expect(result.cents).toBe(120000);
  });
});

describe("variableRemaining", () => {
  it("only reserves the budget not yet spent", () => {
    // Mid-week: $210 of the $300 budget is gone and already out of the balance.
    expect(variableRemaining(30000, 21000)).toBe(9000);
  });

  it("never goes negative when the user overspends", () => {
    // The overage already reduced the bank balance; charging it again would
    // double-count it.
    expect(variableRemaining(30000, 45000)).toBe(0);
  });
});

describe("variableSpendThisWeek", () => {
  const txns: EngineTransaction[] = [
    { amountCents: 8214, date: "2026-08-26", isTransfer: false },
    { amountCents: 4500, date: "2026-08-27", isTransfer: false },
    { amountCents: 60000, date: "2026-08-27", isTransfer: true }, // card payment
    { amountCents: -2000, date: "2026-08-27", isTransfer: false }, // refund
    { amountCents: 9999, date: "2026-08-23", isTransfer: false }, // last week
  ];

  it("counts only this week's outgoing, non-transfer spending", () => {
    expect(variableSpendThisWeek(txns, "2026-08-24", "2026-08-28")).toBe(12714);
  });

  it("excludes debt payments, which is the whole point of the transfer flag", () => {
    // Without the exclusion the $600 card payment would read as living costs
    // and shrink next week's strike by $600 — punishing the user for paying.
    const withoutFlag = txns.map((t) => ({ ...t, isTransfer: false }));
    expect(variableSpendThisWeek(withoutFlag, "2026-08-24", "2026-08-28")).toBe(72714);
  });
});

describe("fixedExpensesDueBefore", () => {
  it("reserves bills due before payday", () => {
    const result = fixedExpensesDueBefore(
      [
        expense({ id: "rent", amountCents: 180000, nextDueDate: "2026-09-01" }),
        expense({ id: "far-off", amountCents: 5000, nextDueDate: "2026-09-25" }),
      ],
      "2026-08-28",
      "2026-09-11",
    );

    expect(result.totalCents).toBe(180000);
    expect(result.charges).toHaveLength(1);
  });

  it("counts a weekly bill every time it lands before payday", () => {
    const result = fixedExpensesDueBefore(
      [expense({ id: "daycare", amountCents: 20000, frequency: "weekly", nextDueDate: "2026-08-31" })],
      "2026-08-28",
      "2026-09-11",
    );

    // 08-31, 09-07 — two charges, $400, not one $200 charge.
    expect(result.charges).toHaveLength(2);
    expect(result.totalCents).toBe(40000);
  });

  it("stops reserving a bill the user marked paid", () => {
    const result = fixedExpensesDueBefore(
      [
        expense({
          id: "rent",
          amountCents: 180000,
          nextDueDate: "2026-09-01",
          lastPaidDate: "2026-09-01",
        }),
      ],
      "2026-08-28",
      "2026-09-11",
    );

    expect(result.totalCents).toBe(0);
  });

  it("keeps reserving a recently overdue bill", () => {
    const result = fixedExpensesDueBefore(
      [expense({ id: "electric", amountCents: 14500, nextDueDate: "2026-08-26" })],
      "2026-08-28",
      "2026-09-11",
    );

    expect(result.totalCents).toBe(14500);
    expect(result.charges[0]?.isOverdue).toBe(true);
  });

  it("stops reserving past the grace window and raises it instead", () => {
    // A one-time bill two months stale would otherwise silently eat the budget
    // every week forever.
    const result = fixedExpensesDueBefore(
      [expense({ id: "old-vet-bill", frequency: "one_time", nextDueDate: "2026-06-20" })],
      "2026-08-28",
      "2026-09-11",
    );

    expect(result.totalCents).toBe(0);
    expect(result.lapsedExpenses).toEqual(["old-vet-bill"]);
  });
});

describe("minimumsToReserve", () => {
  it("reserves minimums due before payday", () => {
    const result = minimumsToReserve(
      [
        debt({ id: "card-a", minimumPaymentCents: 3500, nextDueDate: "2026-09-02" }),
        debt({ id: "card-b", minimumPaymentCents: 2500, nextDueDate: "2026-09-20" }),
      ],
      "2026-08-28",
      "2026-09-11",
    );

    // card-b is covered by the next paycheck, so it is not reserved now.
    expect(result.totalCents).toBe(3500);
  });

  it("skips a minimum confirmed paid for the current cycle", () => {
    const result = minimumsToReserve(
      [
        debt({
          id: "card-a",
          minimumPaymentCents: 3500,
          nextDueDate: "2026-09-02",
          minPaymentPaidForDueDate: "2026-09-02",
        }),
      ],
      "2026-08-28",
      "2026-09-11",
    );

    expect(result.totalCents).toBe(0);
  });

  it("fails closed once the cycle rolls past a stale confirmation", () => {
    // Confirmed for August; the due date is now September. This is the latch bug
    // migration 0003 exists to prevent — the minimum must be reserved again.
    const result = minimumsToReserve(
      [
        debt({
          id: "card-a",
          minimumPaymentCents: 3500,
          nextDueDate: "2026-09-02",
          minPaymentPaidForDueDate: "2026-08-02",
        }),
      ],
      "2026-08-28",
      "2026-09-11",
    );

    expect(result.totalCents).toBe(3500);
  });

  it("reserves when no due date is recorded, rather than assuming nothing is owed", () => {
    const result = minimumsToReserve(
      [debt({ id: "card-a", minimumPaymentCents: 3500, nextDueDate: null })],
      "2026-08-28",
      "2026-09-11",
    );

    expect(result.totalCents).toBe(3500);
  });

  it("never reserves more than the balance", () => {
    const result = minimumsToReserve(
      [debt({ id: "nearly-paid", balanceCents: 1200, minimumPaymentCents: 3500, nextDueDate: "2026-09-02" })],
      "2026-08-28",
      "2026-09-11",
    );

    expect(result.totalCents).toBe(1200);
  });

  it("ignores debts with no balance", () => {
    const result = minimumsToReserve(
      [debt({ id: "cleared", balanceCents: 0, minimumPaymentCents: 3500, nextDueDate: "2026-09-02" })],
      "2026-08-28",
      "2026-09-11",
    );

    expect(result.totalCents).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Strategy
// -----------------------------------------------------------------------------

describe("rankDebts", () => {
  const debts = [
    debt({ id: "sapphire", name: "Sapphire", balanceCents: 310000, aprPercent: 24.99 }),
    debt({ id: "discover", name: "Discover", balanceCents: 120000, aprPercent: 18.24 }),
    debt({ id: "car", name: "Car loan", balanceCents: 890000, aprPercent: 6.49 }),
  ];

  it("orders avalanche by APR", () => {
    expect(rankDebts(debts, "avalanche").map((d) => d.debtId)).toEqual([
      "sapphire",
      "discover",
      "car",
    ]);
  });

  it("orders snowball by balance", () => {
    expect(rankDebts(debts, "snowball").map((d) => d.debtId)).toEqual([
      "discover",
      "sapphire",
      "car",
    ]);
  });

  it("excludes cleared debts from targeting", () => {
    const withCleared = [...debts, debt({ id: "paid-off", balanceCents: 0, aprPercent: 29.99 })];
    expect(rankDebts(withCleared, "avalanche").map((d) => d.debtId)).not.toContain("paid-off");
  });

  it("breaks ties deterministically so the target does not flip between runs", () => {
    const tied = [
      debt({ id: "b-card", balanceCents: 200000, aprPercent: 22 }),
      debt({ id: "a-card", balanceCents: 100000, aprPercent: 22 }),
    ];
    // Equal APR under avalanche: smaller balance first, then id.
    expect(rankDebts(tied, "avalanche").map((d) => d.debtId)).toEqual(["a-card", "b-card"]);
    expect(rankDebts([...tied].reverse(), "avalanche").map((d) => d.debtId)).toEqual([
      "a-card",
      "b-card",
    ]);
  });

  it("reports annual carrying cost, which is what avalanche is minimizing", () => {
    const ranked = rankDebts(debts, "avalanche");
    expect(ranked[0]?.annualInterestCents).toBe(Math.round(310000 * 0.2499));
  });
});

describe("allocateStrike", () => {
  const ranked = rankDebts(
    [
      debt({ id: "small", name: "Small", balanceCents: 4000, aprPercent: 29.99, minimumPaymentCents: 2500 }),
      debt({ id: "big", name: "Big", balanceCents: 500000, aprPercent: 19.99 }),
    ],
    "avalanche",
  );

  it("caps at the balance and rolls the remainder to the next debt", () => {
    // $300 strike, top debt has $40 — the extra must not be thrown at a debt
    // that cannot absorb it.
    const { actions } = allocateStrike(ranked, 30000, [], "avalanche");

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ debtId: "small", amountCents: 4000 });
    expect(actions[1]).toMatchObject({ debtId: "big", amountCents: 26000 });
  });

  it("leaves room for a minimum already reserved on the same debt", () => {
    // $40 balance with $25 of it reserved as the minimum: striking the full $40
    // on top would tell the user to pay $65 on a $40 debt.
    const minimums = [
      { debtId: "small", name: "Small", dueDate: "2026-09-02", amountCents: 2500, isOverdue: false },
    ];
    const { actions } = allocateStrike(ranked, 30000, minimums, "avalanche");

    expect(actions[0]).toMatchObject({ debtId: "small", amountCents: 1500 });
    expect((actions[0]?.amountCents ?? 0) + 2500).toBe(4000);
  });

  it("reports what the debts cannot absorb", () => {
    const { unallocatedCents } = allocateStrike(ranked, 900000, [], "avalanche");
    expect(unallocatedCents).toBe(900000 - 4000 - 500000);
  });

  it("allocates nothing when there is nothing to give", () => {
    expect(allocateStrike(ranked, 0, [], "avalanche").actions).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// End to end
// -----------------------------------------------------------------------------

describe("computeWeeklyPlan", () => {
  it("computes the worked example", () => {
    const plan = computeWeeklyPlan(
      input({
        accounts: [checking(400000)], // $4,000
        expenses: [expense({ id: "rent", amountCents: 180000, nextDueDate: "2026-09-01" })],
        debts: [
          debt({ id: "sapphire", name: "Sapphire", balanceCents: 310000, aprPercent: 24.99, minimumPaymentCents: 3500, nextDueDate: "2026-09-02" }),
          debt({ id: "discover", name: "Discover", balanceCents: 120000, aprPercent: 18.24, minimumPaymentCents: 2500, nextDueDate: "2026-09-05" }),
        ],
        transactions: [{ amountCents: 21000, date: "2026-08-26", isTransfer: false }],
      }),
      { now: NOW },
    );

    expect(plan.today).toBe("2026-08-28");
    expect(plan.weekStart).toBe("2026-08-24");
    expect(plan.nextPayday).toBe("2026-09-11");

    //   $4,000.00  liquid
    // − $1,800.00  rent due 09-01
    // −    $90.00  variable budget left ($300 − $210 spent)
    // −    $60.00  minimums (both due before payday)
    // −   $500.00  floor
    // = $1,550.00  safe to spend
    expect(plan.liquidCashCents).toBe(400000);
    expect(plan.fixedExpensesCents).toBe(180000);
    expect(plan.variableRemainingCents).toBe(9000);
    expect(plan.minimumsReservedCents).toBe(6000);
    expect(plan.safeToSpendCents).toBe(155000);
    expect(plan.recommendedStrikeCents).toBe(155000);

    // Avalanche: the 24.99% card, not the smaller balance.
    expect(plan.targetDebtName).toBe("Sapphire");
  });

  it("switches target when the strategy toggles to snowball", () => {
    const scenario = input({
      accounts: [checking(400000)],
      debts: [
        debt({ id: "sapphire", name: "Sapphire", balanceCents: 310000, aprPercent: 24.99 }),
        debt({ id: "discover", name: "Discover", balanceCents: 120000, aprPercent: 18.24 }),
      ],
      settings: settings({ strategy: "snowball" }),
    });

    expect(computeWeeklyPlan(scenario, { now: NOW }).targetDebtName).toBe("Discover");
  });

  it("rounds the strike down to whole dollars, never up", () => {
    const plan = computeWeeklyPlan(
      input({
        accounts: [checking(105099)],
        settings: settings({ weeklyVariableBudgetCents: 0, minCashBufferCents: 100000 }),
        debts: [debt({ id: "card", balanceCents: 500000, minimumPaymentCents: 0 })],
      }),
      { now: NOW },
    );

    expect(plan.safeToSpendCents).toBe(5099);
    expect(plan.recommendedStrikeCents).toBe(5000); // $50.99 → $50, not $51
  });

  it("recommends nothing and reports the shortfall when the week is underwater", () => {
    const plan = computeWeeklyPlan(
      input({
        accounts: [checking(50000)], // $500
        expenses: [expense({ id: "rent", amountCents: 180000, nextDueDate: "2026-09-01" })],
        debts: [debt({ id: "card", balanceCents: 310000, minimumPaymentCents: 3500, nextDueDate: "2026-09-02" })],
      }),
      { now: NOW },
    );

    expect(plan.recommendedStrikeCents).toBe(0);
    expect(plan.shortfallCents).toBeGreaterThan(0);
    expect(plan.blockers.map((b) => b.code)).toContain("negative_buffer");
  });

  it("never recommends spending the cash floor", () => {
    const plan = computeWeeklyPlan(
      input({
        accounts: [checking(60000)], // $600, floor is $500
        settings: settings({ weeklyVariableBudgetCents: 0 }),
        debts: [debt({ id: "card", balanceCents: 500000, minimumPaymentCents: 0 })],
      }),
      { now: NOW },
    );

    expect(plan.recommendedStrikeCents).toBe(10000); // exactly the $100 above the floor
    expect(plan.liquidCashCents - plan.recommendedStrikeCents).toBeGreaterThanOrEqual(50000);
  });

  it("promotes an overdue minimum ahead of the strike", () => {
    const plan = computeWeeklyPlan(
      input({
        accounts: [checking(400000)],
        settings: settings({ weeklyVariableBudgetCents: 0, minCashBufferCents: 0 }),
        debts: [
          debt({ id: "late", name: "Late card", balanceCents: 120000, aprPercent: 18, minimumPaymentCents: 3500, nextDueDate: "2026-08-25" }),
          debt({ id: "top", name: "Top card", balanceCents: 310000, aprPercent: 24.99, minimumPaymentCents: 0 }),
        ],
      }),
      { now: NOW },
    );

    const first = plan.actions[0];
    expect(first?.type).toBe("minimum");
    expect(first?.debtName).toBe("Late card");
    // The strike still happens — the cash for the minimum was already reserved.
    expect(plan.actions.some((a) => a.type === "strike")).toBe(true);
  });

  it("does not overstate the strike when the debts cannot absorb it", () => {
    const plan = computeWeeklyPlan(
      input({
        accounts: [checking(1000000)], // $10,000
        settings: settings({ weeklyVariableBudgetCents: 0, minCashBufferCents: 0 }),
        debts: [debt({ id: "small", balanceCents: 4000, minimumPaymentCents: 0 })],
      }),
      { now: NOW },
    );

    // $10,000 is safe to spend, but only $40 of debt exists to strike.
    expect(plan.safeToSpendCents).toBe(1000000);
    expect(plan.recommendedStrikeCents).toBe(4000);
  });

  it("flags a missing payday instead of guessing silently", () => {
    const plan = computeWeeklyPlan(
      input({ settings: settings({ nextPayday: null }) }),
      { now: NOW },
    );

    expect(plan.blockers.map((b) => b.code)).toContain("no_payday_set");
    expect(plan.nextPayday).toBe("2026-09-11"); // today + 14 for biweekly
  });

  it("is deterministic — same inputs, same plan", () => {
    const scenario = input({
      accounts: [checking(400000)],
      debts: [
        debt({ id: "a", balanceCents: 100000, aprPercent: 22 }),
        debt({ id: "b", balanceCents: 100000, aprPercent: 22 }),
      ],
    });

    const first = computeWeeklyPlan(scenario, { now: NOW });
    const second = computeWeeklyPlan(scenario, { now: NOW });
    expect(first).toEqual(second);
  });

  it("shrinks the strike as the week's spending accumulates", () => {
    const base = {
      accounts: [checking(400000)],
      debts: [debt({ id: "card", balanceCents: 500000, minimumPaymentCents: 0 })],
      settings: settings({ minCashBufferCents: 0 }),
    };

    const monday = computeWeeklyPlan(input({ ...base, transactions: [] }), { now: NOW });
    const friday = computeWeeklyPlan(
      input({
        ...base,
        transactions: [{ amountCents: 25000, date: "2026-08-26", isTransfer: false }],
      }),
      { now: NOW },
    );

    // $250 spent frees $250 of the reserve — the money already left the account,
    // so it must not be held back a second time.
    expect(friday.recommendedStrikeCents - monday.recommendedStrikeCents).toBe(25000);
  });
});
