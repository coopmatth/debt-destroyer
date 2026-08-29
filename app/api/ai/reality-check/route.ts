import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { AiUnavailableError, isAiConfigured } from "@/lib/ai/client";
import { generateAndStoreRealityCheck } from "@/lib/ai/reality-check";
import { computeAndStoreWeeklyPlan } from "@/lib/engine/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A second opinion on this week's strike, on demand.
 *
 * The brief called for the WeeklyPlan to arrive in the request body. It is
 * recomputed server-side instead, deliberately: this route writes to
 * debt_strikes, and a plan supplied by the caller is a number the caller chose.
 * Accepting it would hand back exactly the forgery route that migration 0005
 * closed — post a plan claiming a $9,000 strike and the stored advice inherits
 * it as its ceiling. The client already has the plan for display; sending it
 * back proves nothing.
 *
 * The work itself lives in generateAndStoreRealityCheck, shared with the weekly
 * cron, so scheduled advice and requested advice are the same advice.
 */
export async function POST() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isAiConfigured()) {
    return NextResponse.json(
      {
        error:
          "The reality check is not configured on this instance. Add GOOGLE_GENERATIVE_AI_API_KEY to enable it.",
      },
      { status: 503 },
    );
  }

  const db = createAdminClient();

  try {
    const { plan } = await computeAndStoreWeeklyPlan(db, userId);
    const outcome = await generateAndStoreRealityCheck(db, userId, plan);

    if (outcome.status === "skipped") {
      return NextResponse.json({
        adjusted_strike_cents: 0,
        rationale_string: null,
        skipped: outcome.reason,
        message:
          outcome.reason === "no_strike"
            ? "There is no surplus to adjust this week."
            : "The reality check is not configured on this instance.",
      });
    }

    const { check, volatility } = outcome;

    return NextResponse.json({
      adjusted_strike_cents: check.adjustedStrikeCents,
      rationale_string: check.rationale,
      deterministic_strike_cents: plan.recommendedStrikeCents,
      holdback_percent: check.holdbackPercent,
      risk_level: check.riskLevel,
      week_start: plan.weekStart,
      volatility: {
        window_days: volatility.windowDays,
        mean_daily_cents: volatility.meanDailyCents,
        coefficient_of_variation: volatility.coefficientOfVariation,
        floor_coverage_days: volatility.floorCoverageDays,
      },
      model: check.model,
      used_fallback: check.usedFallback,
    });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("Reality check failed", err);
    return NextResponse.json(
      { error: "Could not review this week's plan right now." },
      { status: 502 },
    );
  }
}
