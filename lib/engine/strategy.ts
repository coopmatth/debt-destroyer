import type {
  EngineDebt,
  MinimumReservation,
  PlannedAction,
  RankedDebt,
  Strategy,
} from "@/lib/engine/types";

/**
 * Target selection and allocation.
 *
 * Avalanche orders by APR: highest rate first, because that is the balance
 * costing the most per dollar carried. Snowball orders by balance: smallest
 * first, trading arithmetic for the motivation of clearing a whole account.
 */

/** Annualized carrying cost, used for ranking display and tie-breaking. */
export function annualInterestCents(balanceCents: number, aprPercent: number): number {
  return Math.round(balanceCents * (aprPercent / 100));
}

/**
 * Ranks the targetable debts.
 *
 * Ties are broken deterministically — by the other strategy's criterion, then
 * by id. Without a total order the ranking could reorder between runs on equal
 * APRs, and the user would see the recommendation jump between two cards for no
 * visible reason.
 */
export function rankDebts(debts: EngineDebt[], strategy: Strategy): RankedDebt[] {
  const targetable = debts.filter((debt) => debt.balanceCents > 0);

  const sorted = [...targetable].sort((a, b) => {
    if (strategy === "avalanche") {
      if (b.aprPercent !== a.aprPercent) return b.aprPercent - a.aprPercent;
      // Equal rates: clear the smaller balance first, it finishes sooner.
      if (a.balanceCents !== b.balanceCents) return a.balanceCents - b.balanceCents;
    } else {
      if (a.balanceCents !== b.balanceCents) return a.balanceCents - b.balanceCents;
      // Equal balances: the costlier rate first.
      if (b.aprPercent !== a.aprPercent) return b.aprPercent - a.aprPercent;
    }
    return a.id.localeCompare(b.id);
  });

  return sorted.map((debt, index) => ({
    debtId: debt.id,
    name: debt.name,
    balanceCents: debt.balanceCents,
    aprPercent: debt.aprPercent,
    rank: index + 1,
    annualInterestCents: annualInterestCents(debt.balanceCents, debt.aprPercent),
  }));
}

/**
 * Spreads the strike across the ranked debts, capped at what each can absorb.
 *
 * The cascade matters at the end of a payoff. If the top-ranked card has $40
 * left and the strike is $300, recommending $300 against it would overpay by
 * $260 — the money should roll to the next debt in rank order, which is exactly
 * what the avalanche does once an account clears.
 *
 * Headroom is the balance minus any minimum already reserved for that same
 * debt. The minimum is going to be paid too, and without this subtraction a
 * $50 balance with a $35 minimum would be told to pay $85.
 */
export function allocateStrike(
  ranked: RankedDebt[],
  strikeCents: number,
  minimums: MinimumReservation[],
  strategy: Strategy,
): { actions: PlannedAction[]; unallocatedCents: number } {
  const reservedByDebt = new Map<string, number>();
  for (const minimum of minimums) {
    reservedByDebt.set(
      minimum.debtId,
      (reservedByDebt.get(minimum.debtId) ?? 0) + minimum.amountCents,
    );
  }

  const actions: PlannedAction[] = [];
  let remaining = strikeCents;

  for (const debt of ranked) {
    if (remaining <= 0) break;

    const headroom = Math.max(0, debt.balanceCents - (reservedByDebt.get(debt.debtId) ?? 0));
    if (headroom === 0) continue;

    const amountCents = Math.min(remaining, headroom);
    actions.push({
      type: "strike",
      debtId: debt.debtId,
      debtName: debt.name,
      amountCents,
      reason:
        actions.length === 0
          ? strategy === "avalanche"
            ? `Highest APR at ${debt.aprPercent}%`
            : "Smallest balance — clears soonest"
          : "Rolled over after the higher-priority debt was covered",
    });

    remaining -= amountCents;
  }

  return { actions, unallocatedCents: remaining };
}

/**
 * Overdue minimums, promoted to their own actions ahead of the strike.
 *
 * The cash for these is already reserved out of liquid cash, so they are not
 * subtracted from the strike a second time — they are simply the payments that
 * have to happen first. A missed $35 minimum draws a late fee around $40 and
 * can trigger a penalty APR, which outruns anything the avalanche saves.
 */
export function overdueMinimumActions(minimums: MinimumReservation[]): PlannedAction[] {
  return minimums
    .filter((minimum) => minimum.isOverdue)
    .map((minimum) => ({
      type: "minimum" as const,
      debtId: minimum.debtId,
      debtName: minimum.name,
      amountCents: minimum.amountCents,
      reason: minimum.dueDate
        ? `Minimum payment was due ${minimum.dueDate} — pay this before anything else`
        : "Minimum payment is overdue — pay this before anything else",
    }));
}
