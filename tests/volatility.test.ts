import { describe, expect, it } from "vitest";
import {
  applyHoldback,
  computeVolatility,
  MAX_HOLDBACK_PERCENT,
  type SpendSample,
} from "@/lib/ai/volatility";

const WINDOW_START = "2026-08-15";
const WINDOW_END = "2026-08-28"; // 14 days inclusive

function spend(date: string, amountCents: number, isTransfer = false): SpendSample {
  return { date, amountCents, isTransfer };
}

describe("computeVolatility", () => {
  it("averages over every day in the window, not just the active ones", () => {
    // $700 spent on one day out of fourteen. Averaging over active days would
    // call that a $700/day habit; the reserve has to survive the quiet days too.
    const profile = computeVolatility([spend("2026-08-20", 70000)], WINDOW_START, WINDOW_END, 0);

    expect(profile.windowDays).toBe(14);
    expect(profile.activeDays).toBe(1);
    expect(profile.meanDailyCents).toBe(5000); // 70000 / 14
  });

  it("scores steady spending as low variation", () => {
    const steady: SpendSample[] = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date(Date.UTC(2026, 7, 15 + i)).toISOString().slice(0, 10);
      steady.push(spend(date, 5000));
    }

    const profile = computeVolatility(steady, WINDOW_START, WINDOW_END, 50000);
    expect(profile.coefficientOfVariation).toBe(0);
    expect(profile.meanDailyCents).toBe(5000);
    expect(profile.floorCoverageDays).toBe(10);
  });

  it("scores lumpy spending as high variation", () => {
    const lumpy = [spend("2026-08-16", 90000), spend("2026-08-25", 60000)];
    const profile = computeVolatility(lumpy, WINDOW_START, WINDOW_END, 20000);

    expect(profile.coefficientOfVariation).toBeGreaterThan(1);
    expect(profile.busiestDayCents).toBe(90000);
    expect(profile.largestSingleChargeCents).toBe(90000);
  });

  it("excludes transfers and refunds", () => {
    const profile = computeVolatility(
      [
        spend("2026-08-20", 60000, true), // card payment
        spend("2026-08-21", -2000), // refund
        spend("2026-08-22", 4000),
      ],
      WINDOW_START,
      WINDOW_END,
      0,
    );

    expect(profile.totalCents).toBe(4000);
  });

  it("ignores transactions outside the window", () => {
    const profile = computeVolatility(
      [spend("2026-07-01", 99999), spend("2026-08-20", 5000)],
      WINDOW_START,
      WINDOW_END,
      0,
    );
    expect(profile.totalCents).toBe(5000);
  });

  it("reports how many days of spending the floor covers", () => {
    // $500 floor against $50/day typical spending.
    const profile = computeVolatility([spend("2026-08-20", 70000)], WINDOW_START, WINDOW_END, 50000);
    expect(profile.floorCoverageDays).toBe(10);
  });

  it("handles a window with no spending at all", () => {
    const profile = computeVolatility([], WINDOW_START, WINDOW_END, 50000);
    expect(profile.meanDailyCents).toBe(0);
    expect(profile.coefficientOfVariation).toBe(0);
    expect(profile.floorCoverageDays).toBe(0);
  });
});

describe("applyHoldback", () => {
  it("returns the strike unchanged at zero holdback, rounded to $5", () => {
    expect(applyHoldback(20000, 0)).toBe(20000);
  });

  it("reduces by the requested percentage and rounds down to $5", () => {
    // $200 less 20% = $160
    expect(applyHoldback(20000, 20)).toBe(16000);
    // $155 less 15% = $131.75 → floors to $130
    expect(applyHoldback(15500, 15)).toBe(13000);
  });

  it("never exceeds the deterministic strike, whatever the model returns", () => {
    // The safety property: the advisor can only counsel restraint.
    for (const rogue of [-50, -1, 0]) {
      expect(applyHoldback(20000, rogue)).toBeLessThanOrEqual(20000);
    }
    expect(applyHoldback(20000, -100)).toBe(20000);
  });

  it("caps absurd holdbacks rather than recommending nothing", () => {
    const capped = applyHoldback(100000, 999);
    expect(capped).toBe(applyHoldback(100000, MAX_HOLDBACK_PERCENT));
    expect(capped).toBeGreaterThan(0);
  });

  it("keeps an actionable amount when rounding would reach zero", () => {
    // $6 strike less 50% = $3, which floors to $0. A $0 suggestion is not advice.
    expect(applyHoldback(600, 50)).toBe(500);
  });

  it("never invents money on a zero strike", () => {
    expect(applyHoldback(0, 0)).toBe(0);
    expect(applyHoldback(0, 50)).toBe(0);
  });

  it("never returns more than a tiny strike", () => {
    // Rounding up to the $5 floor must still respect the ceiling.
    expect(applyHoldback(300, 50)).toBe(300);
  });

  it("is monotonic — more caution never means more money", () => {
    let previous = applyHoldback(50000, 0);
    for (let percent = 5; percent <= MAX_HOLDBACK_PERCENT; percent += 5) {
      const current = applyHoldback(50000, percent);
      expect(current).toBeLessThanOrEqual(previous);
      previous = current;
    }
  });
});
