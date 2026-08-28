import { Card, CardTitle } from "@/components/ui";
import { formatCents, formatDueDate } from "@/lib/format";
import type { WeeklyPlan } from "@/lib/engine/types";

/**
 * The arithmetic, written out. This is the "show your work" panel — the whole
 * point of storing the breakdown alongside every strike is that the user can
 * ask "why is it $180 and not $400?" and get an answer instead of a shrug.
 *
 * It doubles as the table view the light-mode palette owes: every figure in the
 * allocation bar appears here as text.
 */
export function Ledger({ plan }: { plan: WeeklyPlan }) {
  const rows = [
    {
      label: "Liquid cash",
      value: plan.liquidCashCents,
      sign: "+" as const,
      detail: "checking and savings, available balance",
    },
    {
      label: "Bills due before payday",
      value: plan.fixedExpensesCents,
      sign: "−" as const,
      detail: plan.fixedExpenseCharges.length
        ? plan.fixedExpenseCharges
            .map((c) => `${c.name} ${formatDueDate(c.dueDate, plan.today)}`)
            .join(", ")
        : "none",
    },
    {
      label: "Spending money still to come",
      value: plan.variableRemainingCents,
      sign: "−" as const,
      detail: `${formatCents(plan.variableBudgetCents)} budget, ${formatCents(plan.variableSpentCents)} already spent`,
    },
    {
      label: "Minimum payments",
      value: plan.minimumsReservedCents,
      sign: "−" as const,
      detail: plan.minimumReservations.length
        ? plan.minimumReservations
            .map((m) => `${m.name}${m.dueDate ? ` ${formatDueDate(m.dueDate, plan.today)}` : ""}`)
            .join(", ")
        : "none due before payday",
    },
    {
      label: "Cash floor",
      value: plan.bufferFloorCents,
      sign: "−" as const,
      detail: "your untouchable minimum",
    },
  ];

  return (
    <Card>
      <CardTitle hint={`as of ${plan.today}`}>How this number was reached</CardTitle>

      <table className="w-full text-sm">
        <caption className="sr-only">
          Weekly cash breakdown from liquid cash down to safe to spend
        </caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-hairline last:border-0">
              <td className="py-2.5 pr-3 align-top">
                <div className="text-ink">{row.label}</div>
                <div className="text-xs text-ink-muted">{row.detail}</div>
              </td>
              <td className="tabular py-2.5 text-right align-top whitespace-nowrap text-ink">
                <span className="text-ink-muted">{row.sign}</span>{" "}
                {formatCents(row.value)}
              </td>
            </tr>
          ))}
          <tr>
            <td className="pt-3 font-medium text-ink">Safe to spend</td>
            <td
              className={`tabular pt-3 text-right font-semibold whitespace-nowrap ${
                plan.safeToSpendCents < 0 ? "text-critical" : "text-ink"
              }`}
            >
              {formatCents(plan.safeToSpendCents)}
            </td>
          </tr>
          {plan.recommendedStrikeCents !== Math.max(0, plan.safeToSpendCents) ? (
            <tr>
              <td className="pt-1 text-xs text-ink-muted">
                Rounded down to whole dollars
                {plan.recommendedStrikeCents <
                Math.floor(Math.max(0, plan.safeToSpendCents) / 100) * 100
                  ? " and capped at what your debts can absorb"
                  : ""}
              </td>
              <td className="tabular pt-1 text-right text-xs text-ink-muted whitespace-nowrap">
                {formatCents(plan.recommendedStrikeCents)}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Card>
  );
}
