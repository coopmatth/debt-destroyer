import { describe, expect, it } from "vitest";
import type { Transaction } from "plaid";
import { isTransferLike, mapAccountType } from "@/lib/plaid/mappers";

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
    // The user pays their card from checking. If that counted as spending, the
    // next recommendation would shrink by the exact amount they just paid.
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
