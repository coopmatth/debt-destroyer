import { formatCents } from "@/lib/format";
import type { WeeklyPlan } from "@/lib/engine/types";

/**
 * Where this week's liquid cash goes — one stacked bar, parts summing to the
 * whole, plus the same figures as a table.
 *
 * A stacked bar is the honest form here because the buckets genuinely partition
 * the balance: bills, budget, minimums, floor, and whatever survives as the
 * strike. Colour is assigned by bucket identity and never moves — the strike is
 * always slot 1 whether it is the largest slice or absent.
 *
 * Three of the light-mode slots fall below 3:1 against the surface, so the
 * relief rule applies: every segment is labelled in the legend with its exact
 * amount, and the ledger below repeats all of it as text. Nothing here is
 * carried by colour alone.
 */

interface Segment {
  key: string;
  label: string;
  cents: number;
  colorVar: string;
  note?: string;
}

export function AllocationBar({ plan }: { plan: WeeklyPlan }) {
  const segments: Segment[] = [
    {
      key: "strike",
      label: "Weekly strike",
      cents: Math.max(0, plan.recommendedStrikeCents),
      colorVar: "var(--series-1)",
      note: plan.targetDebtName ? `to ${plan.targetDebtName}` : undefined,
    },
    {
      key: "fixed",
      label: "Bills due before payday",
      cents: plan.fixedExpensesCents,
      colorVar: "var(--series-2)",
      note: `${plan.fixedExpenseCharges.length} charge${plan.fixedExpenseCharges.length === 1 ? "" : "s"}`,
    },
    {
      key: "variable",
      label: "Spending money left",
      cents: plan.variableRemainingCents,
      colorVar: "var(--series-3)",
      note: `${formatCents(plan.variableSpentCents)} of ${formatCents(plan.variableBudgetCents)} spent`,
    },
    {
      key: "minimums",
      label: "Minimum payments",
      cents: plan.minimumsReservedCents,
      colorVar: "var(--series-4)",
      note: `${plan.minimumReservations.length} due`,
    },
    {
      key: "floor",
      label: "Your cash floor",
      cents: plan.bufferFloorCents,
      colorVar: "var(--series-5)",
      note: "never spent",
    },
  ];

  const total = segments.reduce((sum, segment) => sum + segment.cents, 0);
  const visible = segments.filter((segment) => segment.cents > 0);

  if (total === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Nothing to allocate yet — link an account and add your bills.
      </p>
    );
  }

  return (
    <div>
      {/* 2px gaps between fills keep adjacent segments from reading as one mark. */}
      <div className="flex h-10 w-full gap-0.5 overflow-hidden" role="img"
        aria-label={visible
          .map((segment) => `${segment.label}: ${formatCents(segment.cents)}`)
          .join("; ")}
      >
        {visible.map((segment, index) => {
          const share = segment.cents / total;
          return (
            <div
              key={segment.key}
              title={`${segment.label} — ${formatCents(segment.cents)}`}
              className="flex min-w-[3px] items-center justify-center overflow-hidden"
              style={{
                flexBasis: `${share * 100}%`,
                background: segment.colorVar,
                // 4px rounded ends on the outer edges only; interior joins stay square.
                borderTopLeftRadius: index === 0 ? 4 : 0,
                borderBottomLeftRadius: index === 0 ? 4 : 0,
                borderTopRightRadius: index === visible.length - 1 ? 4 : 0,
                borderBottomRightRadius: index === visible.length - 1 ? 4 : 0,
              }}
            >
              {/* Direct label only where it fits without truncation. */}
              {share > 0.14 ? (
                <span className="px-2 text-xs font-medium text-white/95">
                  {formatCents(segment.cents, { showCents: false })}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-baseline gap-2 text-sm">
            <span
              aria-hidden
              className="mt-1 inline-block size-2.5 shrink-0 rounded-sm"
              style={{ background: segment.colorVar }}
            />
            <span className="text-ink-secondary">{segment.label}</span>
            <span className="tabular ml-auto font-medium text-ink">
              {formatCents(segment.cents)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
