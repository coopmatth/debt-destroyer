import { redirect } from "next/navigation";
import { getAuthenticatedUserId, createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeAndStoreWeeklyPlan } from "@/lib/engine/loader";
import { DashboardLayoutClient } from "@/components/dashboard/DashboardLayoutClient";
import { StrikeCard } from "@/components/dashboard/StrikeCard";
import { CashflowCard } from "@/components/dashboard/CashflowCard";
import { CalendarView } from "@/components/dashboard/CalendarView";
import type { WeeklyPlan } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const adminDb = createAdminClient();
  let plan: WeeklyPlan;

  try {
    // computeAndStoreWeeklyPlan calculates the plan and guarantees a row 
    // exists in the database for the current week.
    const result = await computeAndStoreWeeklyPlan(adminDb, userId);
    plan = result.plan;
  } catch (err) {
    redirect("/settings");
  }

  const supabase = await createServerSupabaseClient();

  const [
    { data: currentStrike },
    { data: debts },
    { data: expenses }
  ] = await Promise.all([
    supabase
      .from("debt_strikes")
      .select("id, status, recommended_amount_cents, ai_adjusted_amount_cents, ai_rationale, week_start")
      .eq("user_id", userId)
      .eq("week_start", plan.weekStart)
      .maybeSingle(),
    supabase.from("debts").select("*").eq("user_id", userId).eq("is_active", true),
    supabase.from("expenses").select("*").eq("user_id", userId).eq("is_active", true)
  ]);

  const advice = currentStrike?.ai_adjusted_amount_cents != null ? {
    adjustedAmountCents: currentStrike.ai_adjusted_amount_cents,
    rationale: currentStrike.ai_rationale,
  } : null;

  // If the strike is already paid, we grab the saved amount so it doesn't vanish to $0
  const isPaid = currentStrike?.status === "paid";
  const savedAmountCents = isPaid 
    ? (currentStrike.ai_adjusted_amount_cents ?? currentStrike.recommended_amount_cents) 
    : null;

  return (
    <div className="flex flex-col gap-6">
      <DashboardLayoutClient 
        strikeCard={
          <StrikeCard 
            plan={plan} 
            strikeId={currentStrike?.id ?? null} 
            status={currentStrike?.status ?? null} 
            advice={advice}
            savedAmountCents={savedAmountCents}
          />
        }
        cashflowCard={<CashflowCard plan={plan} />}
        calendar={<CalendarView plan={plan} debts={debts ?? []} expenses={expenses ?? []} />}
      />
    </div>
  );
}
