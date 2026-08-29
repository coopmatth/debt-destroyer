import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAiConfigured, withModelFallback } from "@/lib/ai/client";
import {
  applyHoldback,
  computeVolatility,
  MAX_HOLDBACK_PERCENT,
  type VolatilityProfile,
} from "@/lib/ai/volatility";
import { addDays } from "@/lib/engine/dates";
import type { WeeklyPlan } from "@/lib/engine/types";
import type { Database } from "@/types/database.types";

/**
 * The reality check.
 *
 * The deterministic engine answers "what is arithmetically safe". It is right,
 * and it is also willing to leave someone at exactly their floor on a Tuesday
 * with eight days to payday — technically solvent, practically one flat tyre
 * from trouble. This layer asks a different question: given how erratically
 * this person actually spends, how much of that safe number should they hold
 * back?
 *
 * The model supplies judgment as a percentage. Every cent is computed here, and
 * the result can only ever be lower than the deterministic strike.
 */

const realityCheckSchema = z.object({
  holdback_percent: z
    .number()
    .describe(
      `How much of the mathematically safe strike to hold back, 0-${MAX_HOLDBACK_PERCENT}. 0 means the maths is already appropriately cautious.`,
    ),
  risk_level: z
    .enum(["comfortable", "tight", "fragile"])
    .describe("How much slack the week leaves after the strike."),
  rationale: z
    .string()
    .describe(
      "One or two plain sentences addressed to the user explaining the adjustment. No preamble, no markdown, no figures the input did not contain.",
    ),
});

const SYSTEM_PROMPT = `You are a conservative financial planner reviewing a debt payment.

A deterministic budget has already calculated the largest payment this person
can make while covering every bill due before payday, every minimum payment,
their weekly spending budget, and a personal cash floor. That number is correct
arithmetic. You are not checking its maths and you cannot increase it.

Your only judgment: given how this person actually spends, how much of that
number should be held back as breathing room?

Weigh these, in order:
- Volatility. A high coefficient of variation, or a single day far above the
  average, means the coming week is unpredictable and deserves more slack.
- Floor coverage. A cash floor worth less than two or three days of typical
  spending is thin, whatever its dollar value.
- Days until payday. A long stretch with no income arriving compounds every
  other risk.
- Size. Emptying most of what is available matters more than shaving a small
  surplus.

Hold back 0 when spending is steady, the floor is healthy, and payday is near.
Most weeks should be 0 or a small number. Reserve larger holdbacks for genuinely
erratic spending or a thin floor.

Never invent figures. Speak plainly and without jargon, in the second person.
Do not moralise about their spending — you are adjusting a number, not
critiquing a lifestyle.`;

function buildPrompt(plan: WeeklyPlan, volatility: VolatilityProfile): string {
  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return `Proposed payment: ${dollars(plan.recommendedStrikeCents)} toward ${
    plan.targetDebtName ?? "their highest-priority debt"
  }.

The week:
- Liquid cash right now: ${dollars(plan.liquidCashCents)}
- Bills due before payday: ${dollars(plan.fixedExpensesCents)}
- Spending budget not yet used: ${dollars(plan.variableRemainingCents)}
- Minimum payments reserved: ${dollars(plan.minimumsReservedCents)}
- Personal cash floor, already protected: ${dollars(plan.bufferFloorCents)}
- Days until payday: ${plan.daysUntilPayday}

Spending over the last ${volatility.windowDays} days:
- Total: ${dollars(volatility.totalCents)} across ${volatility.activeDays} active days
- Typical day: ${dollars(volatility.meanDailyCents)} (median ${dollars(volatility.medianDailyCents)})
- Day-to-day variation: ${dollars(volatility.stdDevCents)} std dev, coefficient of variation ${volatility.coefficientOfVariation}
- Busiest single day: ${dollars(volatility.busiestDayCents)}
- Largest single charge: ${dollars(volatility.largestSingleChargeCents)}
- The cash floor covers about ${volatility.floorCoverageDays} days of typical spending`;
}

export interface RealityCheckResult {
  adjustedStrikeCents: number;
  rationale: string;
  riskLevel: "comfortable" | "tight" | "fragile";
  holdbackPercent: number;
  model: string;
  usedFallback: boolean;
}

export async function runRealityCheck(
  plan: WeeklyPlan,
  volatility: VolatilityProfile,
): Promise<RealityCheckResult> {
  const { result, model, usedFallback } = await withModelFallback((languageModel) =>
    generateObject({
      model: languageModel,
      schema: realityCheckSchema,
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(plan, volatility),
      temperature: 0,
    }),
  );

  const { holdback_percent, risk_level, rationale } = result.object;

  // The clamp lives in applyHoldback, so a model returning 900 or -5 cannot
  // produce a strike above the deterministic ceiling or below zero.
  const adjustedStrikeCents = applyHoldback(plan.recommendedStrikeCents, holdback_percent);

  return {
    adjustedStrikeCents,
    rationale: rationale.trim().slice(0, 400),
    riskLevel: risk_level,
    holdbackPercent: Math.min(MAX_HOLDBACK_PERCENT, Math.max(0, Math.round(holdback_percent))),
    model,
    usedFallback,
  };
}

// -----------------------------------------------------------------------------
// Orchestration
//
// Shared by the on-demand route and the weekly cron so the two cannot drift.
// Advice generated by a schedule and advice generated by a button press should
// be the same advice.
// -----------------------------------------------------------------------------

export const VOLATILITY_WINDOW_DAYS = 14;

export type RealityCheckOutcome =
  | {
      status: "advised";
      check: RealityCheckResult;
      volatility: VolatilityProfile;
    }
  | { status: "skipped"; reason: "no_strike" | "not_configured" };

/**
 * Reviews a plan and stores the advice against that week's strike row.
 *
 * `plan` must be server-computed. Passing one in from a request body would let
 * a caller choose the ceiling the advice is clamped against, which is the
 * forgery path migration 0005 closed.
 *
 * The write is an update, never an insert: the row belongs to the engine, and
 * these columns are service-role-only.
 */
export async function generateAndStoreRealityCheck(
  db: SupabaseClient<Database>,
  userId: string,
  plan: WeeklyPlan,
): Promise<RealityCheckOutcome> {
  if (!isAiConfigured()) return { status: "skipped", reason: "not_configured" };

  // Nothing to moderate. Skip the model rather than spend a call asking it to
  // be careful with zero dollars.
  if (plan.recommendedStrikeCents <= 0) return { status: "skipped", reason: "no_strike" };

  const windowStart = addDays(plan.today, -(VOLATILITY_WINDOW_DAYS - 1));

  const { data: transactions, error } = await db
    .from("transactions")
    .select("amount_cents, date, is_transfer")
    .eq("user_id", userId)
    .gte("date", windowStart)
    .lte("date", plan.today);

  if (error) throw new Error(`Could not load recent spending: ${error.message}`);

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

  const { error: updateError } = await db
    .from("debt_strikes")
    .update({
      ai_adjusted_amount_cents: check.adjustedStrikeCents,
      ai_rationale: check.rationale,
    })
    .eq("user_id", userId)
    .eq("week_start", plan.weekStart);

  if (updateError) throw new Error(`Could not save the advice: ${updateError.message}`);

  return { status: "advised", check, volatility };
}
