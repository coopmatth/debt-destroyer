import { describe, expect, it } from "vitest";
import { centsToDollars, dollarsToCents, formatCents, owedCents } from "@/lib/money";

describe("dollarsToCents", () => {
  it("converts ordinary amounts", () => {
    expect(dollarsToCents(0)).toBe(0);
    expect(dollarsToCents(12.34)).toBe(1234);
    expect(dollarsToCents(-45.67)).toBe(-4567);
    expect(dollarsToCents(1000000.01)).toBe(100000001);
  });

  it("survives the binary float cases that break naive multiplication", () => {
    // 1.005 * 100 === 100.49999999999999 in IEEE 754, which rounds to 100.
    expect(1.005 * 100).toBeLessThan(100.5);
    expect(dollarsToCents(1.005)).toBe(101);

    expect(dollarsToCents(0.1 + 0.2)).toBe(30);
    expect(dollarsToCents(8.165)).toBe(817);
    expect(dollarsToCents(1.155)).toBe(116);
  });

  it("passes null through and rejects nonsense", () => {
    expect(dollarsToCents(null)).toBeNull();
    expect(dollarsToCents(undefined)).toBeNull();
    expect(() => dollarsToCents(Number.NaN)).toThrow(RangeError);
    expect(() => dollarsToCents(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("normalizes owed balances to positive magnitudes", () => {
    expect(owedCents(-310.5)).toBe(31050);
    expect(owedCents(310.5)).toBe(31050);
    expect(owedCents(null)).toBe(0);
  });

  it("round-trips through dollars", () => {
    for (const dollars of [0, 0.01, 19.99, 1234.56, 99999.99]) {
      expect(centsToDollars(dollarsToCents(dollars)!)).toBeCloseTo(dollars, 2);
    }
  });
});

describe("formatCents", () => {
  it("renders currency for the UI", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(31025)).toBe("$310.25");
    expect(formatCents(-4500)).toBe("-$45.00");
    expect(formatCents(123456, { showCents: false })).toBe("$1,235");
  });
});
