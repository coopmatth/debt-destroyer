import type {
  EngineDebt,
  MinimumReservation,
  PlannedAction,
  RankedDebt,
  Strategy,
} from "@/lib/engine/types";

export function annualInterestCents(balanceCents: number, aprPercent: number): number {
  return Math.round(balanceCents * (aprPercent / 100));
}

export function rankDebts(debts: EngineDebt[], strategy: Strategy): RankedDebt[] {
  const targetable = debts.filter((debt) => debt.balanceCents > 0);

  const sorted = [...targetable].sort((a, b) => {
    if (strategy === "avalanche") {
      if (b.aprPercent !== a.aprPercent) return b.aprPercent - a.aprPercent;
      // Equal rates: clear the larger balance first, hitting the higher-impact debt.
      if (a.balanceCents !== b.balanceCents) return b.balanceCents - a.balanceCents;
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
