import type { ExpenseFrequency, IsoDate } from "@/lib/engine/dates";
import { addDays, daysBetween } from "@/lib/engine/dates";

/**
 * Deterministic recurrence detection.
 *
 * This runs before the model sees anything, and it owns every number. The
 * split is deliberate: arithmetic here, judgment there. Language models are
 * unreliable at averaging a column of figures, and these amounts become
 * reserved bills that shrink the weekly strike — a hallucinated $180 where the
 * real charge is $18 would quietly distort every recommendation until someone
 * noticed.
 *
 * So the model never computes. It decides which of these candidates is a
 * genuine bill rather than a coincidence of repeat purchases, and what to call
 * it. Amount, cadence, and dates come from here, where they are testable.
 */

export interface TransactionSample {
  amountCents: number;
  date: IsoDate;
  name: string | null;
  merchantName: string | null;
  isTransfer: boolean;
}

export interface RecurrenceCandidate {
  /** Normalized grouping key, and the handle the model refers back to. */
  key: string;
  displayName: string;
  occurrences: number;
  medianAmountCents: number;
  /** How much the charge moves between occurrences, as a percentage of median. */
  amountSpreadPct: number;
  medianIntervalDays: number;
  frequency: ExpenseFrequency;
  firstSeen: IsoDate;
  lastSeen: IsoDate;
  /** Projected from the last occurrence plus the observed interval. */
  nextDueDate: IsoDate;
}

/** At least two sightings, or there is no interval to measure. */
const MIN_OCCURRENCES = 2;

/** Bounds the prompt. Candidates are ranked before this bites. */
const MAX_CANDIDATES = 40;

/**
 * Collapses the noise banks put in descriptions — store numbers, reference
 * ids, processor prefixes — so "SQ *BLUE BOTTLE #42" and "SQ *BLUE BOTTLE #7"
 * land in the same bucket.
 */
export function merchantKey(raw: string): string {
  const tokens = raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  // Drop purely numeric tokens — store numbers, invoice refs, dates — but keep
  // a leading one, because that digit is part of the name in "7-Eleven" and
  // "1-800-Flowers".
  //
  // Length-based stripping does not work here: it removed "#42" while leaving
  // "#7", so two charges at the same merchant landed in different buckets.
  return tokens
    .filter((token, index) => index === 0 || !/^\d+$/.test(token))
    .join(" ")
    .trim();
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
    : (sorted[mid] ?? 0);
}

/**
 * Maps an observed interval onto a frequency the expenses table understands.
 *
 * Semimonthly is deliberately absent. Twice a month averages ~15.2 days, which
 * is inside any honest biweekly band, so interval alone cannot separate them —
 * claiming otherwise would just be a coin flip wearing a label. Biweekly is the
 * safer of the two to guess: it reserves slightly more often, and the user can
 * correct it on the Bills page.
 */
export function frequencyForInterval(days: number): ExpenseFrequency | null {
  if (days >= 5 && days <= 10) return "weekly";
  if (days >= 11 && days <= 20) return "biweekly";
  if (days >= 21 && days <= 45) return "monthly";
  if (days >= 46 && days <= 135) return "quarterly";
  if (days >= 136 && days <= 400) return "annual";
  return null; // too frequent to be a bill, or too sparse to call recurring
}

export function findRecurrenceCandidates(
  transactions: TransactionSample[],
): RecurrenceCandidate[] {
  const groups = new Map<string, { label: string; amounts: number[]; dates: IsoDate[] }>();

  for (const transaction of transactions) {
    // Transfers and debt payments are not bills — the debts table owns those,
    // and suggesting a card payment as a bill would reserve the same money twice.
    if (transaction.isTransfer) continue;
    // Positive is money out. Refunds and inflows are not charges.
    if (transaction.amountCents <= 0) continue;

    const label = transaction.merchantName ?? transaction.name;
    if (!label) continue;

    const key = merchantKey(label);
    if (key.length < 3) continue;

    const group = groups.get(key) ?? { label, amounts: [], dates: [] };
    group.amounts.push(transaction.amountCents);
    group.dates.push(transaction.date);
    groups.set(key, group);
  }

  const candidates: RecurrenceCandidate[] = [];

  for (const [key, group] of groups) {
    // Two charges on one day is one purchase split, not a cadence.
    const uniqueDates = [...new Set(group.dates)].sort();
    if (uniqueDates.length < MIN_OCCURRENCES) continue;

    const intervals: number[] = [];
    for (let i = 1; i < uniqueDates.length; i++) {
      intervals.push(daysBetween(uniqueDates[i - 1]!, uniqueDates[i]!));
    }

    const medianIntervalDays = median(intervals);
    const frequency = frequencyForInterval(medianIntervalDays);
    if (!frequency) continue;

    const medianAmountCents = median(group.amounts);
    if (medianAmountCents <= 0) continue;

    const spread = Math.max(
      ...group.amounts.map((a) => Math.abs(a - medianAmountCents)),
    );

    const lastSeen = uniqueDates[uniqueDates.length - 1]!;

    candidates.push({
      key,
      displayName: group.label,
      occurrences: uniqueDates.length,
      medianAmountCents,
      amountSpreadPct: Math.round((spread / medianAmountCents) * 100),
      medianIntervalDays,
      frequency,
      firstSeen: uniqueDates[0]!,
      lastSeen,
      nextDueDate: addDays(lastSeen, medianIntervalDays),
    });
  }

  // Most-seen first: a charge observed six times is a far better bet than one
  // seen twice, and this is what the cap trims against.
  candidates.sort(
    (a, b) =>
      b.occurrences - a.occurrences ||
      b.medianAmountCents - a.medianAmountCents ||
      a.key.localeCompare(b.key),
  );

  return candidates.slice(0, MAX_CANDIDATES);
}

/**
 * Whether the user already tracks this bill.
 *
 * Substring matching in both directions catches "Netflix" against "Netflix
 * Subscription", but only for keys long enough to mean something — a
 * three-character key would match half the list.
 */
export function isAlreadyTracked(candidateName: string, existingNames: string[]): boolean {
  const key = merchantKey(candidateName);
  if (!key) return false;

  return existingNames.some((existing) => {
    const existingKey = merchantKey(existing);
    if (!existingKey) return false;
    if (existingKey === key) return true;
    if (key.length >= 4 && existingKey.includes(key)) return true;
    if (existingKey.length >= 4 && key.includes(existingKey)) return true;
    return false;
  });
}
