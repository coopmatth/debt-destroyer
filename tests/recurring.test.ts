import { describe, expect, it } from "vitest";
import {
  findRecurrenceCandidates,
  frequencyForInterval,
  isAlreadyTracked,
  merchantKey,
  type TransactionSample,
} from "@/lib/ai/recurring";

/** Builds a run of charges on a fixed cadence. */
function series(
  label: string,
  startDate: string,
  everyDays: number,
  count: number,
  amountCents: number,
  overrides: Partial<TransactionSample> = {},
): TransactionSample[] {
  const out: TransactionSample[] = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);

  for (let i = 0; i < count; i++) {
    out.push({
      amountCents,
      date: cursor.toISOString().slice(0, 10),
      name: label,
      merchantName: label,
      isTransfer: false,
      ...overrides,
    });
    cursor = new Date(cursor.getTime() + everyDays * 86_400_000);
  }
  return out;
}

describe("merchantKey", () => {
  it("collapses store numbers and processor noise", () => {
    expect(merchantKey("SQ *BLUE BOTTLE #42")).toBe(merchantKey("SQ *BLUE BOTTLE #7"));
    expect(merchantKey("NETFLIX.COM")).toBe("netflix com");
    expect(merchantKey("  Con   Edison  ")).toBe("con edison");
  });

  it("keeps short numbers that are part of the name", () => {
    // 7-Eleven must not be shredded into nothing.
    expect(merchantKey("7-ELEVEN 1234")).toBe("7 eleven");
  });
});

describe("frequencyForInterval", () => {
  it("maps intervals onto the expense frequencies", () => {
    expect(frequencyForInterval(7)).toBe("weekly");
    expect(frequencyForInterval(14)).toBe("biweekly");
    expect(frequencyForInterval(30)).toBe("monthly");
    expect(frequencyForInterval(91)).toBe("quarterly");
    expect(frequencyForInterval(365)).toBe("annual");
  });

  it("rejects intervals too tight or too sparse to be a bill", () => {
    expect(frequencyForInterval(1)).toBeNull();
    expect(frequencyForInterval(3)).toBeNull();
    expect(frequencyForInterval(500)).toBeNull();
  });
});

describe("findRecurrenceCandidates", () => {
  it("finds a monthly subscription", () => {
    const candidates = findRecurrenceCandidates(
      series("NETFLIX.COM", "2026-06-05", 30, 3, 1599),
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      displayName: "NETFLIX.COM",
      occurrences: 3,
      medianAmountCents: 1599,
      frequency: "monthly",
    });
    // Projected forward from the last sighting.
    expect(candidates[0]?.nextDueDate).toBe("2026-09-03");
  });

  it("ignores a single charge — one sighting has no interval", () => {
    expect(findRecurrenceCandidates(series("ONE OFF VET", "2026-07-01", 30, 1, 24000))).toEqual(
      [],
    );
  });

  it("excludes transfers and debt payments", () => {
    // These are the debts table's business; reserving them as bills would hold
    // the same money back twice.
    const candidates = findRecurrenceCandidates(
      series("CHASE CARD PAYMENT", "2026-06-01", 30, 3, 35000, { isTransfer: true }),
    );
    expect(candidates).toEqual([]);
  });

  it("excludes refunds and inflows", () => {
    const candidates = findRecurrenceCandidates(
      series("PAYROLL", "2026-06-01", 14, 6, -250000),
    );
    expect(candidates).toEqual([]);
  });

  it("groups charges that differ only by store number", () => {
    const candidates = findRecurrenceCandidates([
      ...series("SQ *BLUE BOTTLE #42", "2026-06-01", 7, 1, 650),
      ...series("SQ *BLUE BOTTLE #7", "2026-06-08", 7, 1, 725),
      ...series("SQ *BLUE BOTTLE #91", "2026-06-15", 7, 1, 690),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.occurrences).toBe(3);
  });

  it("reports amount variability so a utility can be told from a subscription", () => {
    const varying: TransactionSample[] = [
      { amountCents: 8000, date: "2026-06-08", name: "CON EDISON", merchantName: "CON EDISON", isTransfer: false },
      { amountCents: 14500, date: "2026-07-08", name: "CON EDISON", merchantName: "CON EDISON", isTransfer: false },
      { amountCents: 21000, date: "2026-08-08", name: "CON EDISON", merchantName: "CON EDISON", isTransfer: false },
    ];

    const candidate = findRecurrenceCandidates(varying)[0];
    expect(candidate?.frequency).toBe("monthly");
    expect(candidate?.medianAmountCents).toBe(14500);
    expect(candidate?.amountSpreadPct).toBeGreaterThan(25);
  });

  it("treats two charges on one day as one occurrence, not a cadence", () => {
    const sameDay: TransactionSample[] = [
      { amountCents: 1200, date: "2026-08-01", name: "TARGET", merchantName: "TARGET", isTransfer: false },
      { amountCents: 3400, date: "2026-08-01", name: "TARGET", merchantName: "TARGET", isTransfer: false },
    ];
    expect(findRecurrenceCandidates(sameDay)).toEqual([]);
  });

  it("ranks the most-repeated charges first", () => {
    const candidates = findRecurrenceCandidates([
      ...series("RARE CO", "2026-06-01", 30, 2, 5000),
      ...series("OFTEN CO", "2026-06-01", 7, 8, 1000),
    ]);

    expect(candidates[0]?.displayName).toBe("OFTEN CO");
  });

  it("is deterministic across runs", () => {
    const input = [
      ...series("NETFLIX", "2026-06-05", 30, 3, 1599),
      ...series("SPOTIFY", "2026-06-11", 30, 3, 1099),
    ];
    expect(findRecurrenceCandidates(input)).toEqual(findRecurrenceCandidates(input));
  });
});

describe("isAlreadyTracked", () => {
  it("matches on exact and partial names", () => {
    expect(isAlreadyTracked("NETFLIX.COM", ["Netflix"])).toBe(true);
    expect(isAlreadyTracked("Netflix", ["Netflix Subscription"])).toBe(true);
    expect(isAlreadyTracked("CON EDISON", ["Electric"])).toBe(false);
  });

  it("does not match on a short key that appears everywhere", () => {
    // A 3-character key would otherwise swallow half the list.
    expect(isAlreadyTracked("CVS", ["CVS Pharmacy Rewards Club"])).toBe(false);
  });

  it("handles an empty bill list", () => {
    expect(isAlreadyTracked("Netflix", [])).toBe(false);
  });
});
