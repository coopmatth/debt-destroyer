import { formatCents } from "@/lib/format";
import type { WeeklyPlan } from "@/lib/engine/types";
import { AllocationBar } from "@/components/dashboard/AllocationBar";

export function CashflowCard({ plan }: { plan: WeeklyPlan }) {
  // Use the exact property names from the engine types
  const liquid = plan.liquidCashCents ?? 0;
  const bills = plan.fixedExpensesCents ?? 0;
  const minimums = plan.minimumsReservedCents ?? 0;
  const floor = plan.bufferFloorCents ?? 0;
  const safe = plan.safeToSpendCents ?? 0;
  const variableLeft = plan.variableRemainingCents ?? 0;
  const variableSpent = plan.variableSpentCents ?? 0;
  const variableBudget = plan.variableBudgetCents ?? 0;

  return (
    <div className="rounded-xl border border-hairline bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-ink-secondary uppercase">
          How this number was reached
        </h2>
        <span className="text-xs text-ink-muted">as of {plan.today}</span>
      </div>

      <div className="mb-6">
        <AllocationBar plan={plan} />
      </div>

      <div className="flex flex-col gap-3 text-sm">
        <div className="flex justify-between items-center pb-3 border-b border-hairline/50">
          <div className="flex flex-col">
            <span className="text-ink">Liquid cash</span>
            <span className="text-[10px] text-ink-muted">checking and savings, available balance</span>
          </div>
          <span className="tabular text-ink font-medium">
            + {formatCents(liquid)}
          </span>
        </div>

        <div className="flex justify-between items-center pb-3 border-b border-hairline/50">
          <div className="flex flex-col">
            <span className="text-ink">Bills due before payday</span>
          </div>
          <span className="tabular text-ink font-medium">
            - {formatCents(bills)}
          </span>
        </div>

        <div className="flex justify-between items-center pb-3 border-b border-hairline/50">
          <div className="flex flex-col">
            <span className="text-ink">Spending money still to come</span>
            <span className="text-[10px] text-ink-muted">{formatCents(variableBudget)} budget, {formatCents(variableSpent)} already spent</span>
          </div>
          <span className="tabular text-ink font-medium">
            - {formatCents(variableLeft)}
          </span>
        </div>

        <div className="flex justify-between items-center pb-3 border-b border-hairline/50">
          <div className="flex flex-col">
            <span className="text-ink">Minimum payments</span>
          </div>
          <span className="tabular text-ink font-medium">
            - {formatCents(minimums)}
          </span>
        </div>

        <div className="flex justify-between items-center pb-3 border-b border-hairline/50">
          <div className="flex flex-col">
            <span className="text-ink">Cash floor</span>
            <span className="text-[10px] text-ink-muted">your untouchable minimum</span>
          </div>
          <span className="tabular text-ink font-medium">
            - {formatCents(floor)}
          </span>
        </div>

        <div className="flex justify-between items-center pt-2">
          <div className="flex flex-col">
            <span className="text-ink font-semibold">Safe to spend</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="tabular text-ink font-bold text-lg">
              {formatCents(safe)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
