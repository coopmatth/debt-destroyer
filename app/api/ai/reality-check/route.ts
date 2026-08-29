import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { AiUnavailableError, isAiConfigured } from "@/lib/ai/client";
import { runRealityCheck } from "@/lib/ai/reality-check";
import { computeVolatility } from "@/lib/ai/volatility";
import { computeAndStoreWeeklyPlan } from "@/lib/engine/loader";
import { addDays } from "@/lib/engine/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VOLATILITY_WINDOW_DAYS = 14;

/**
 * A second opinion on this week's strike.
 *
 * The brief called for the WeeklyPlan to arrive in the request body. It is
 * recomputed server-side instead, deliberately: this route writes to
 * debt_strikes, and a plan supplied by the caller is a number the caller chose.
 * Accepting it would hand back exactly the forgery route that migration 0005
 * closed — post a plan claiming a $9,000 strike and the stored advice inherits
 * it. The client already has the plan for display; sending it back proves
 * nothing.
 *
 * Recomputing also guarantees the strike row exists before we update it, and
 * costs one query set on a route that is about to make a network call anyway.
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

    // Nothing to moderate. Skip the model rather than spend a call asking it to
    // be careful with zero dollars.
    if (plan.recommendedStrikeCents <= 0) {
      return NextResponse.json({
        adjusted_strike_cents: 0,
        rationale_string: null,
        skipped: "no_strike",
        message: "There is no surplus to adjust this week.",
      });
    }

    const windowStart = addDays(plan.today, -(VOLATILITY_WINDOW_DAYS - 1));
    const { data: transactions, error } = await db
      .from("transactions")
      .select("amount_cents, date, is_transfer")
      .eq("user_id", userId)
      .gte("date", windowStart)
      .lte("date", plan.today);

    if (error) {
      console.error("Reality check transaction query failed", error);
      return NextResponse.json({ error: "Could not load recent spending" }, { status: 500 });
    }

    const volatility = computeVolatility(
      (transactions ?? []).map((row) => ({
        amountCents: row.amount_cents,
        date: row.date,
        isTransfer: row.is_transfer,
      })),
      windowStart,
      plan.today,
      plan.bufferFloorCents,
    );

    const check = await runRealityCheck(plan, volatility);

    // Only ever an update. The row is created by the engine, and these columns
    // are service-role-only, so this is the single path that writes them.
    const { error: updateError } = await db
      .from("debt_strikes")
      .update({
        ai_adjusted_amount_cents: check.adjustedStrikeCents,
        ai_rationale: check.rationale,
      })
      .eq("user_id", userId)
      .eq("week_start", plan.weekStart);

    if (updateError) {
      console.error("Failed to persist reality check", updateError);
      return NextResponse.json({ error: "Could not save the advice" }, { status: 500 });
    }

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
