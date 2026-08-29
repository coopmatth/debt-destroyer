import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { withModelFallback } from "@/lib/ai/client";
import type { RecurrenceCandidate } from "@/lib/ai/recurring";
import { EXPENSE_CATEGORIES } from "@/lib/validation/expenses";
import type { ExpenseFrequency, IsoDate } from "@/lib/engine/dates";

/**
 * Classifying recurrence candidates into bills.
 *
 * The model's entire job is judgment that arithmetic cannot settle: twelve
 * charges at a coffee shop are a habit, three at Netflix are a subscription,
 * and both look identical to an interval calculation. It also picks a readable
 * name and a category.
 *
 * Every figure — amount, cadence, next due date — is carried over from the
 * deterministic pass in `recurring.ts` and never round-trips through the model.
 * These amounts become reserved bills that shrink the weekly strike, so a
 * hallucinated $180 where the real charge is $18 would quietly distort every
 * recommendation until someone noticed.
 */

export interface SuggestedBill {
  /** The shape the client consumes. */
  name: string;
  estimated_amount_cents: number;
  frequency: ExpenseFrequency;
  category: string;
  /** Context for the UI, so a suggestion can be judged before it is accepted. */
  next_due_date: IsoDate;
  occurrences: number;
  last_seen: IsoDate;
  amount_varies: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
}

/**
 * generateObject takes the Zod schema directly and handles provider-specific
 * structured-output plumbing, so the schema is the contract rather than a
 * hand-written JSON Schema kept in sync with a parser.
 */
const billClassificationSchema = z.object({
  bills: z.array(
    z.object({
      key: z
        .string()
        .describe("The exact candidate key from the input. Never invent one."),
      name: z
        .string()
        .describe("Short human name for the bill, e.g. 'Netflix' or 'Con Edison'."),
      category: z.enum(EXPENSE_CATEGORIES),
      is_recurring_bill: z
        .boolean()
        .describe(
          "True only for a scheduled obligation: subscription, utility, insurance, rent, phone, membership. False for ordinary repeat shopping.",
        ),
      confidence: z.enum(["high", "medium", "low"]),
      reason: z.string().describe("One short clause explaining the call."),
    }),
  ),
});

const SYSTEM_PROMPT = `You identify recurring bills in someone's bank activity.

You are given merchants that already repeat on a regular cadence. Repetition is
established; your job is to judge what each repetition MEANS.

Mark is_recurring_bill true only for a scheduled obligation the person is
committed to — subscriptions, streaming, utilities, insurance, rent or mortgage,
phone and internet, gym or other memberships, childcare, storage.

Mark it false for discretionary spending that merely happens on a rhythm:
groceries, coffee, restaurants, rideshare, fuel, retail, pharmacy, pet shops,
convenience stores. A weekly supermarket trip is a habit, not a bill. This
distinction is the whole task — when unsure, answer false.

A wrong true is expensive: it reserves money every week that the person could
otherwise have put against their debt.

Return one entry for every candidate, reusing the given key exactly. Do not
invent merchants, and do not perform any arithmetic — amounts and dates are
handled elsewhere.`;

function buildPrompt(candidates: RecurrenceCandidate[]): string {
  const lines = candidates.map((candidate) => {
    const dollars = (candidate.medianAmountCents / 100).toFixed(2);
    const variability =
      candidate.amountSpreadPct > 25
        ? `varies by ±${candidate.amountSpreadPct}%`
        : "consistent amount";

    return [
      `key: ${candidate.key}`,
      `  description: ${candidate.displayName}`,
      `  seen ${candidate.occurrences}x, about every ${candidate.medianIntervalDays} days`,
      `  typical charge: $${dollars} (${variability})`,
      `  first seen ${candidate.firstSeen}, last seen ${candidate.lastSeen}`,
    ].join("\n");
  });

  return `Candidates from the last 90 days:\n\n${lines.join("\n\n")}`;
}

export interface ClassificationResult {
  bills: SuggestedBill[];
  /** Which model actually answered — surfaced so an alias shift is visible. */
  model: string;
  usedFallback: boolean;
}

export async function classifyRecurringBills(
  candidates: RecurrenceCandidate[],
): Promise<ClassificationResult> {
  if (candidates.length === 0) {
    return { bills: [], model: "none", usedFallback: false };
  }

  const { result, model, usedFallback } = await withModelFallback((languageModel) =>
    generateObject({
      model: languageModel,
      schema: billClassificationSchema,
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(candidates),
      // Classification, not composition. Keep it repeatable.
      temperature: 0,
    }),
  );

  const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));

  const bills = result.object.bills.flatMap((bill): SuggestedBill[] => {
    if (!bill.is_recurring_bill) return [];

    // Only keys we supplied. A hallucinated merchant has no numbers behind it
    // and must not reach the user as something they can one-click into a bill.
    const candidate = byKey.get(bill.key);
    if (!candidate) return [];

    return [
      {
        name: bill.name.trim().slice(0, 120),
        // Deterministic, every one of them.
        estimated_amount_cents: candidate.medianAmountCents,
        frequency: candidate.frequency,
        category: bill.category,
        next_due_date: candidate.nextDueDate,
        occurrences: candidate.occurrences,
        last_seen: candidate.lastSeen,
        amount_varies: candidate.amountSpreadPct > 25,
        confidence: bill.confidence,
        reason: bill.reason.slice(0, 300),
      },
    ];
  });

  return { bills, model, usedFallback };
}
