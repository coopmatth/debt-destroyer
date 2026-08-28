import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { addMonths } from "@/lib/engine/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  status: z.enum(["accepted", "skipped", "paid"]),
  /** Actual amount paid, when it differs from the recommendation. */
  amountPaidCents: z.number().int().min(0).optional(),
});

/**
 * Records what the user did with a recommendation.
 *
 * Marking a strike `paid` is the only place the engine writes back to `debts`,
 * and it is what keeps manual tracking from becoming a chore: the balance drops
 * by what was paid and the due date rolls to the next cycle, so the user does
 * not retype numbers every week.
 *
 * The write is deliberately conservative — it only ever *reduces* a balance,
 * clamped at zero, and only for debts the strike actually targeted.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;

  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid update", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const db = createAdminClient();

  // Ownership is checked here because the service role bypasses RLS.
  const { data: strike, error: loadError } = await db
    .from("debt_strikes")
    .select("id, user_id, status, recommended_amount_cents, target_debt_id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (loadError) {
    console.error("Failed to load strike", loadError);
    return NextResponse.json({ error: "Could not load strike" }, { status: 500 });
  }
  if (!strike) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (strike.status === "paid") {
    // Re-applying a payment would decrement the balance twice.
    return NextResponse.json({ error: "This strike is already recorded as paid" }, { status: 409 });
  }

  const { status } = parsed.data;
  let debtUpdated: string | null = null;

  if (status === "paid" && strike.target_debt_id) {
    const amountPaidCents = parsed.data.amountPaidCents ?? strike.recommended_amount_cents;

    const { data: debt, error: debtError } = await db
      .from("debts")
      .select("id, current_balance_cents, next_due_date, min_payment_paid_for_due_date")
      .eq("id", strike.target_debt_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (debtError) {
      console.error("Failed to load target debt", debtError);
      return NextResponse.json({ error: "Could not load the target debt" }, { status: 500 });
    }

    if (debt) {
      const newBalance = Math.max(0, debt.current_balance_cents - amountPaidCents);

      // Paying the strike also satisfies this cycle's minimum on that debt, so
      // roll the cycle forward. Without this the next run would still reserve a
      // minimum the user has already covered.
      const nextDueDate = debt.next_due_date ? addMonths(debt.next_due_date, 1) : null;

      const { error: updateError } = await db
        .from("debts")
        .update({
          current_balance_cents: newBalance,
          ...(debt.next_due_date
            ? {
                next_due_date: nextDueDate,
                min_payment_paid_for_due_date: debt.next_due_date,
              }
            : {}),
        })
        .eq("id", debt.id)
        .eq("user_id", userId);

      if (updateError) {
        console.error("Failed to apply payment to debt", updateError);
        return NextResponse.json({ error: "Could not apply the payment" }, { status: 500 });
      }

      debtUpdated = debt.id;
    }
  }

  const { data: updated, error: strikeError } = await db
    .from("debt_strikes")
    .update({ status })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (strikeError) {
    console.error("Failed to update strike", strikeError);
    return NextResponse.json({ error: "Could not update strike" }, { status: 500 });
  }

  return NextResponse.json({ strike: updated, debtUpdated });
}
