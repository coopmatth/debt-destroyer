import { Badge, Card } from "@/components/ui";
import { formatCents, formatRelativeDays } from "@/lib/format";
import { StrikeActions } from "@/components/dashboard/StrikeActions";
import type { WeeklyPlan } from "@/lib/engine/types";

/**
 * The hero figure. Exactly one per view, proportional figures (tabular-nums
 * makes a display-size number look loose), same sans as everything else.
 */
export function StrikeCard({
  plan,
  strikeId,
  status,
}: {
  plan: WeeklyPlan;
  strikeId: string | null;
  status: string | null;
}) {
  const hasStrike = plan.recommendedStrikeCents > 0;

  return (
    <Card className="relative overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-wide text-ink-secondary uppercase">
            This week&rsquo;s debt strike
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Week of {plan.weekStart} · payday {formatRelativeDays(plan.nextPayday, plan.today)}
          </p>
        </div>
        <Badge tone={plan.strategy === "avalanche" ? "accent" : "neutral"}>
          {plan.strategy === "avalanche" ? "Avalanche" : "Snowball"}
        </Badge>
      </div>

      <p className="mt-6 text-6xl font-semibold tracking-tight text-ink">
        {formatCents(plan.recommendedStrikeCents)}
      </p>

      {hasStrike && plan.targetDebtName ? (
        <p className="mt-2 text-ink-secondary">
          Send it to{" "}
          <span className="font-medium text-ink">{plan.targetDebtName}</span>
          {plan.rankedDebts[0]?.aprPercent ? (
            <span className="text-ink-muted"> · highest cost to carry</span>
          ) : null}
        </p>
      ) : (
        <p className="mt-2 text-ink-secondary">
          {plan.shortfallCents > 0
            ? `Committed costs run ${formatCents(plan.shortfallCents)} past your cash this week. Nothing extra to send.`
            : "No surplus this week. That is the honest answer, not a failure."}
        </p>
      )}

      {hasStrike && strikeId ? (
        <StrikeActions
          strikeId={strikeId}
          status={status}
          amountCents={plan.recommendedStrikeCents}
        />
      ) : null}
    </Card>
  );
}
