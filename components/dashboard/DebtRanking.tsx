import Link from "next/link";
import { Badge, Card, CardTitle, EmptyState } from "@/components/ui";
import { formatApr, formatCents } from "@/lib/format";
import type { WeeklyPlan } from "@/lib/engine/types";

/**
 * The payoff order.
 *
 * The balance bars are one hue for every row — colour follows the entity, and
 * here every row is the same kind of thing, so shading by rank would encode
 * position in a channel that means magnitude. The target is marked with a badge
 * and a border, never by being the only coloured row.
 */
export function DebtRanking({ plan }: { plan: WeeklyPlan }) {
  if (plan.rankedDebts.length === 0) {
    return (
      <Card>
        <CardTitle>Payoff order</CardTitle>
        <EmptyState title="No debts yet">
          <Link href="/debts" className="underline">
            Add a debt
          </Link>{" "}
          with its APR, balance, and minimum payment.
        </EmptyState>
      </Card>
    );
  }

  /**
   * The bar encodes the ranking key itself — APR under avalanche, balance under
   * snowball — so its length always descends with rank.
   *
   * Encoding anything else breaks that. Balance while ranking by APR puts the
   * target at the top with the shortest bar; annual interest cost is no better,
   * because it scales with balance, so a big low-rate loan outruns a small
   * high-rate card that legitimately ranks above it. The yearly cost is still
   * worth showing — as text, on the row, where it informs without pretending to
   * be the sort order.
   */
  const metric = (debt: (typeof plan.rankedDebts)[number]) =>
    plan.strategy === "avalanche" ? debt.aprPercent : debt.balanceCents;

  const largest = Math.max(...plan.rankedDebts.map(metric), Number.MIN_VALUE);

  return (
    <Card>
      <CardTitle
        hint={plan.strategy === "avalanche" ? "highest APR first" : "smallest balance first"}
      >
        Payoff order
      </CardTitle>

      <ol className="flex flex-col gap-3">
        {plan.rankedDebts.map((debt) => {
          const isTarget = debt.debtId === plan.targetDebtId;
          return (
            <li
              key={debt.debtId}
              className={`rounded-lg border p-3 ${
                isTarget ? "border-series-1/50 bg-surface-2" : "border-transparent"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-medium text-ink">
                  <span className="text-ink-muted tabular">{debt.rank}.</span> {debt.name}
                </span>
                {isTarget ? <Badge tone="accent">This week&rsquo;s target</Badge> : null}
                <span className="tabular ml-auto text-sm text-ink">
                  {formatCents(debt.balanceCents)}
                </span>
              </div>

              <div className="mt-2 h-1.5 w-full rounded-sm bg-surface-2">
                <div
                  className="h-1.5 rounded-sm"
                  style={{
                    width: `${(metric(debt) / largest) * 100}%`,
                    background: "var(--series-1)",
                  }}
                />
              </div>

              <p className="mt-1.5 text-xs text-ink-muted tabular">
                {formatApr(debt.aprPercent)} APR · about{" "}
                {formatCents(debt.annualInterestCents, { showCents: false })} a year to carry
              </p>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-xs text-ink-muted">
        Bar length shows{" "}
        {plan.strategy === "avalanche"
          ? "APR — what the avalanche ranks on"
          : "balance — what the snowball clears first"}
        .
      </p>
    </Card>
  );
}
