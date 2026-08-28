import { describe, expect, it } from "vitest";
import type { APR, Transaction } from "plaid";
import {
  dollarsToCents,
  effectiveApr,
  isTransferLike,
  mapAccountType,
  owedCents,
} from "@/lib/plaid/mappers";

const apr = (type: string, percentage: number, balance: number | null): APR =>
  ({
    apr_type: type,
    apr_percentage: percentage,
    balance_subject_to_apr: balance,
    interest_charge_amount: null,
  }) as APR;

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
});

describe("effectiveApr", () => {
  it("returns zero when the issuer reports no APRs", () => {
    expect(effectiveApr([])).toEqual({ apr: 0, aprType: "unknown" });
  });

  it("uses the single rate when only one carries a balance", () => {
    const result = effectiveApr([
      apr("purchase_apr", 24.99, 3100),
      apr("cash_apr", 29.99, 0),
    ]);
    expect(result).toEqual({ apr: 24.99, aprType: "purchase_apr" });
  });

  it("blends by balance so a promo card is not ranked on its headline rate", () => {
    // $5,000 at 0% promo + $500 at 24.99% => 24.99 * 500 / 5500 = 2.2718...
    const result = effectiveApr([
      apr("special", 0, 5000),
      apr("purchase_apr", 24.99, 500),
    ]);
    expect(result.aprType).toBe("blended");
    expect(result.apr).toBeCloseTo(2.2718, 4);

    // The blend must rank this below a smaller card at a flat 22%.
    const other = effectiveApr([apr("purchase_apr", 22, 1200)]);
    expect(result.apr).toBeLessThan(other.apr);
  });

  it("falls back to purchase APR when no balances are reported", () => {
    const result = effectiveApr([
      apr("cash_apr", 29.99, null),
      apr("purchase_apr", 19.99, null),
      apr("balance_transfer_apr", 0, null),
    ]);
    expect(result).toEqual({ apr: 19.99, aprType: "purchase_apr" });
  });

  it("falls back by priority when purchase APR is absent", () => {
    const result = effectiveApr([
      apr("penalty_apr", 34.99, null),
      apr("balance_transfer_apr", 5.99, null),
    ]);
    expect(result.aprType).toBe("balance_transfer_apr");
  });

  it("rounds to the numeric(6,4) precision the column stores", () => {
    const result = effectiveApr([
      apr("purchase_apr", 24.99, 3333),
      apr("cash_apr", 29.99, 1111),
    ]);
    expect(result.apr).toBe(Math.round(result.apr * 10_000) / 10_000);
    expect(`${result.apr}`.split(".")[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });
});

describe("mapAccountType", () => {
  it("folds brokerage into investment and unknowns into other", () => {
    expect(mapAccountType("depository")).toBe("depository");
    expect(mapAccountType("credit")).toBe("credit");
    expect(mapAccountType("brokerage")).toBe("investment");
    expect(mapAccountType("something-new")).toBe("other");
  });
});

describe("isTransferLike", () => {
  const txn = (primary: string | undefined): Transaction =>
    ({
      personal_finance_category: primary ? { primary, detailed: `${primary}_OTHER` } : null,
    }) as Transaction;

  it("excludes card payments and internal moves from living expenses", () => {
    expect(isTransferLike(txn("LOAN_PAYMENTS"))).toBe(true);
    expect(isTransferLike(txn("TRANSFER_OUT"))).toBe(true);
    expect(isTransferLike(txn("TRANSFER_IN"))).toBe(true);
  });

  it("keeps real spending", () => {
    expect(isTransferLike(txn("FOOD_AND_DRINK"))).toBe(false);
    expect(isTransferLike(txn("BANK_FEES"))).toBe(false);
    expect(isTransferLike(txn(undefined))).toBe(false);
  });
});
