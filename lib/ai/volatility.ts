import type { IsoDate } from "@/lib/engine/dates";
import { addDays, daysBetween } from "@/lib/engine/dates";

/**
 * Spending volatility over a recent window.
 *
 * Every figure here is computed, not asked for. The model's job in the reality
 * check is to weigh these signals and decide how much caution is warranted; it
 * never derives them, because "what is the standard deviation of these numbers"
 * is exactly the question a language model answers confidently and wrongly.
 */

export interface SpendSample {
  amountCents: number;
  date: IsoDate;
  isTransfer: boolean;
}

export interface VolatilityProfile {
  windowDays: number;
  /** Days in the window that had any spending at all. */
  activeDays: number;
  totalCents: number;
  meanDailyCents: number;
  medianDailyCents: number;
  /** Population standard deviation of daily totals. */
  stdDevCents: number;
  /**
   * Standard deviation as a share of the mean. The headline volatility signal:
   * roughly 0 is a metronome, above ~0.8 is genuinely lumpy.
   */
  coefficientOfVariation: number;
  busiestDayCents: number;
  largestSingleChargeCents: number;
  /**
   * How many days of typical spending the cash floor would absorb. A floor that
   * covers less than a couple of days is thin whatever its dollar value.
   */
  floorCoverageDays: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
    : (sorted[mid] ?? 0);
}

export function computeVolatility(
  transactions: SpendSample[],
  windowStart: IsoDate,
  windowEnd: IsoDate,
  bufferFloorCents: number,
): VolatilityProfile {
  const windowDays = Math.max(1, daysBetween(windowStart, windowEnd) + 1);

  // Every day in the window, including the zero-spend ones. Averaging only over
  // active days would overstate the daily burn of someone who shops twice a
  // week, and the reserve has to survive the quiet days too.
  const dailyTotals = new Map<string, number>();
  for (let i = 0; i < windowDays; i++) {
    dailyTotals.set(addDays(windowStart, i), 0);
  }

  let largestSingleChargeCents = 0;

  for (const transaction of transactions) {
    if (transaction.isTransfer) continue;
    if (transaction.amountCents <= 0) continue;
    if (!dailyTotals.has(transaction.date)) continue;

    dailyTotals.set(
      transaction.date,
      (dailyTotals.get(transaction.date) ?? 0) + transaction.amountCents,
    );
    largestSingleChargeCents = Math.max(largestSingleChargeCents, transaction.amountCents);
  }

  const totals = [...dailyTotals.values()];
  const totalCents = totals.reduce((sum, value) => sum + value, 0);
  const meanDailyCents = Math.round(totalCents / windowDays);

  const variance =
    totals.reduce((sum, value) => sum + (value - meanDailyCents) ** 2, 0) / windowDays;
  const stdDevCents = Math.round(Math.sqrt(variance));

  return {
    windowDays,
    activeDays: totals.filter((value) => value > 0).length,
    totalCents,
    meanDailyCents,
    medianDailyCents: median(totals),
    stdDevCents,
    coefficientOfVariation:
      meanDailyCents > 0 ? Math.round((stdDevCents / meanDailyCents) * 100) / 100 : 0,
    busiestDayCents: totals.length > 0 ? Math.max(...totals) : 0,
    largestSingleChargeCents,
    floorCoverageDays:
      meanDailyCents > 0 ? Math.round((bufferFloorCents / meanDailyCents) * 10) / 10 : 0,
  };
}

/** Holding back more than this stops being advice and becomes refusal. */
export const MAX_HOLDBACK_PERCENT = 60;

/** Recommendations land on $5 boundaries — a payment someone can act on. */
const ROUNDING_UNIT_CENTS = 500;

/**
 * Turns the model's judgment into a number.
 *
 * The model says how much caution it wants as a percentage; the arithmetic
 * happens here. Two invariants hold no matter what comes back:
 *
 *   - the result never exceeds the deterministic strike, so the advisor can
 *     only ever counsel restraint and can never talk someone into paying more
 *     than the maths found safe;
 *   - rounding is always downward, so it cannot creep back above the ceiling.
 */
export function applyHoldback(
  deterministicStrikeCents: number,
  holdbackPercent: number,
): number {
  if (deterministicStrikeCents <= 0) return 0;

  const clampedPercent = Math.min(
    MAX_HOLDBACK_PERCENT,
    Math.max(0, Math.round(holdbackPercent)),
  );

  const reduced = (deterministicStrikeCents * (100 - clampedPercent)) / 100;
  const rounded = Math.floor(reduced / ROUNDING_UNIT_CENTS) * ROUNDING_UNIT_CENTS;

  // Rounding down can reach zero on a small strike; a $0 "suggestion" is not
  // advice, so keep the smallest actionable payment instead.
  const floored = rounded > 0 ? rounded : Math.min(ROUNDING_UNIT_CENTS, deterministicStrikeCents);

  return Math.min(floored, deterministicStrikeCents);
}
