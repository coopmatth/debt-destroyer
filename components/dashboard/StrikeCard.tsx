import { Badge, Card } from "@/components/ui";
import { formatCents, formatRelativeDays } from "@/lib/format";
import { StrikeActions } from "@/components/dashboard/StrikeActions";
import type { WeeklyPlan } from "@/lib/engine/types";

export interface StrikeAdvice {
  adjustedAmountCents: number;
  rationale: string | null;
}

export function StrikeCard({
  plan,
  strikeId,
  status,
  advice,
  savedAmountCents,
}: {
  plan: WeeklyPlan;
  strikeId: string | null;
  status: string | null;
  advice?: StrikeAdvice | null;
  savedAmountCents?: number | null;
}) {
  const isPaid = status === "paid";
  const hasStrike = plan.recommendedStrikeCents > 0 || isPaid;

  const adviceApplies =
    !isPaid &&
    hasStrike &&
    advice != null &&
    advice.adjustedAmountCents > 0 &&
    advice.adjustedAmountCents < plan.recommendedStrikeCents;

  const headlineCents = isPaid && savedAmountCents != null
    ? savedAmountCents
    : (adviceApplies ? advice.adjustedAmountCents : plan.recommendedStrikeCents);

  return (
    <Card className="relative overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-wide text-ink-secondary uppercase">
            {isPaid ? "This week's strike (Paid)" : "This week's debt strike"}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Week of {plan.weekStart} · payday {formatRelativeDays(plan.nextPayday, plan.today)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {adviceApplies ? <Badge tone="warning">◆ Adjusted for safety</Badge> : null}
          {isPaid ? (
            <Badge tone="good">✓ Paid</Badge>
          ) : (
            <Badge tone={plan.strategy === "avalanche" ? "accent" : "neutral"}>
              {plan.strategy === "avalanche" ? "Avalanche" : "Snowball"}
            </Badge>
          )}
        </div>
      </div>

      <p className="mt-6 text-6xl font-semibold tracking-tight text-ink">
        {formatCents(headlineCents)}
      </p>

      {isPaid ? (
        <div className="mt-6 rounded-lg border border-good/30 bg-good/10 p-4">
          <p className="font-medium text-good">Strike Complete</p>
          <p className="mt-1 text-sm text-good/80">
            Waiting for Friday morning to calculate next week's strike.
          </p>
        </div>
      ) : (
        <>
          {hasStrike && plan.targetDebtName ? (
            <p className="mt-2 text-ink-secondary">
              Send it to <span className="font-medium text-ink">{plan.targetDebtName}</span>
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

          {adviceApplies ? (
            <div className="mt-5 rounded-lg border border-hairline bg-surface-2 p-4">
              {advice.rationale ? (
                <p className="text-sm text-ink-secondary">
                  <span aria-hidden className="mr-1.5 text-warning">
                    ◆
                  </span>
                  {advice.rationale}
                </p>
              ) : null}

              <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="text-ink-muted">Aggressive option:</span>
                <span className="tabular font-semibold text-ink">
                  {formatCents(plan.recommendedStrikeCents)}
                </span>
                <span className="text-ink-muted">
                  — the full amount the maths says is safe
                </span>
              </p>
            </div>
          ) : null}

          {hasStrike && strikeId ? (
            <StrikeActions
              strikeId={strikeId}
              status={status}
              amountCents={headlineCents}
              alternativeAmountCents={
                adviceApplies ? plan.recommendedStrikeCents : undefined
              }
            />
          ) : null}
        </>
      )}
    </Card>
  );
}
