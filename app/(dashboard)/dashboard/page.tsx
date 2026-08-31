import { redirect } from "next/navigation";
import { getAuthenticatedUserId, createServerSupabaseClient } from "@/lib/supabase/server";
import { computeWeeklyPlan } from "@/lib/engine";
import { loadPlanInput } from "@/lib/engine/loader";
import { DashboardLayoutClient } from "@/components/dashboard/DashboardLayoutClient";
import { StrikeCard } from "@/components/dashboard/StrikeCard";
import { CashflowCard } from "@/components/dashboard/CashflowCard";
import { CalendarView } from "@/components/dashboard/CalendarView";
import type { WeeklyPlan } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const supabase = await createServerSupabaseClient();
  let plan: WeeklyPlan;

  try {
    const input = await loadPlanInput(supabase, userId);
    plan = computeWeeklyPlan(input);
  } catch (err) {
    redirect("/settings");
  }

  // Fetch data required for StrikeCard and CalendarView, including AI advice fields
  const [
    { data: currentStrike },
    { data: debts },
    { data: expenses }
  ] = await Promise.all([
    supabase
      .from("debt_strikes")
      .select("id, status, ai_adjusted_amount_cents, ai_rationale")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    supabase.from("debts").select("*").eq("user_id", userId).eq("is_active", true),
    supabase.from("expenses").select("*").eq("user_id", userId).eq("is_active", true)
  ]);

  // Construct the advice object if the reality check has been run
  const advice = currentStrike?.ai_adjusted_amount_cents != null ? {
    adjustedAmountCents: currentStrike.ai_adjusted_amount_cents,
    rationale: currentStrike.ai_rationale,
  } : null;

  return (
    <div className="flex flex-col gap-6">
      <DashboardLayoutClient 
        strikeCard={
          <StrikeCard 
            plan={plan} 
            strikeId={currentStrike?.id ?? null} 
            status={currentStrike?.status ?? null} 
            advice={advice}
          />
        }
        cashflowCard={<CashflowCard plan={plan} />}
        calendar={<CalendarView plan={plan} debts={debts ?? []} expenses={expenses ?? []} />}
      />
    </div>
  );
}
