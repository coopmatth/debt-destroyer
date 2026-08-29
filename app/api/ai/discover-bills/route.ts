import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAiConfigured, AiUnavailableError } from "@/lib/ai/client";
import { classifyRecurringBills } from "@/lib/ai/discover-bills";
import { findRecurrenceCandidates, isAlreadyTracked } from "@/lib/ai/recurring";
import { addDays, todayInTimezone } from "@/lib/engine/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOOKBACK_DAYS = 90;

/**
 * Suggests bills the user is paying but has not told the app about.
 *
 * Three stages, in order of how much they can be trusted:
 *   1. Deterministic grouping and interval maths over 90 days of transactions.
 *   2. The model, judging which of those repetitions are actually obligations.
 *   3. Deterministic diffing against the bills already tracked.
 *
 * The model sits in the middle, where the question is "what does this mean"
 * rather than "what does this add up to". Nothing it returns reaches the
 * database directly — the client still POSTs an accepted suggestion through
 * /api/expenses, which validates it like any hand-entered bill.
 *
 * Reads use the RLS-scoped client, so the user's own transactions are the only
 * ones Postgres will hand back.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isAiConfigured()) {
    return NextResponse.json(
      {
        error:
          "Bill discovery is not configured on this instance. Add GOOGLE_GENERATIVE_AI_API_KEY to enable it.",
      },
      { status: 503 },
    );
  }

  const { data: profile } = await supabase
    .from("users")
    .select("timezone")
    .eq("id", user.id)
    .single();

  const today = todayInTimezone(profile?.timezone ?? "UTC");
  const since = addDays(today, -LOOKBACK_DAYS);

  const [transactionsResult, expensesResult] = await Promise.all([
    supabase
      .from("transactions")
      .select("amount_cents, date, name, merchant_name, is_transfer")
      .gte("date", since)
      .lte("date", today)
      .order("date", { ascending: true }),
    supabase.from("expenses").select("name").eq("is_active", true),
  ]);

  if (transactionsResult.error || expensesResult.error) {
    console.error("Bill discovery query failed", {
      transactions: transactionsResult.error?.message,
      expenses: expensesResult.error?.message,
    });
    return NextResponse.json({ error: "Could not load your transactions" }, { status: 500 });
  }

  const transactions = transactionsResult.data ?? [];
  if (transactions.length === 0) {
    return NextResponse.json({
      suggestions: [],
      message:
        "No transactions synced yet. Connect a bank account and sync before running discovery.",
    });
  }

  const candidates = findRecurrenceCandidates(
    transactions.map((row) => ({
      amountCents: row.amount_cents,
      date: row.date,
      name: row.name,
      merchantName: row.merchant_name,
      isTransfer: row.is_transfer,
    })),
  );

  // Diff before the model runs, not after: bills already tracked are the single
  // largest source of candidates, and every one dropped here is prompt tokens
  // not spent and a wrong suggestion that cannot be made.
  const existingNames = (expensesResult.data ?? []).map((row) => row.name);
  const unknownCandidates = candidates.filter(
    (candidate) => !isAlreadyTracked(candidate.displayName, existingNames),
  );

  if (unknownCandidates.length === 0) {
    return NextResponse.json({
      suggestions: [],
      message:
        candidates.length > 0
          ? "Every recurring charge we can see is already on your Bills page."
          : "No repeating charges found in the last 90 days.",
      scanned: transactions.length,
    });
  }

  try {
    const { bills, model, usedFallback } = await classifyRecurringBills(unknownCandidates);

    // Belt and braces: the model renames things, and a rename could collide
    // with an existing bill that the pre-filter did not catch.
    const suggestions = bills.filter((bill) => !isAlreadyTracked(bill.name, existingNames));

    return NextResponse.json({
      suggestions,
      scanned: transactions.length,
      candidates: unknownCandidates.length,
      model,
      usedFallback,
    });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("Bill classification failed", err);
    return NextResponse.json(
      { error: "Could not analyze your transactions right now." },
      { status: 502 },
    );
  }
}
