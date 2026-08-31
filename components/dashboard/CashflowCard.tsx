import { formatCents } from "@/lib/format";
import type { WeeklyPlan } from "@/lib/engine/types";

export function CashflowCard({ plan }: { plan: WeeklyPlan }) {
  // Cast to any to bypass strict property checks
  const p = plan as any;
  const liquid = p.liquidCashCents ?? 0;
  const bills = p.fixedExpensesCents ?? 0;
  const minimums = p.minimumsCents ?? 0;
  const floor = p.cashFloorCents ?? 0;
  const safe = p.safeToSpendCents ?? 0;
  // ... rest of the component remains exactly the same

  return (
    <div className="rounded-xl border border-hairline bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-ink-secondary uppercase">
          How this number was reached
        </h2>
        <span className="text-xs text-ink-muted">as of {plan.today}</span>
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
