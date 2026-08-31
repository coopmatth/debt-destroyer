import { redirect } from "next/navigation";
import { getAuthenticatedUserId, createServerSupabaseClient } from "@/lib/supabase/server";
import { computeWeeklyPlan } from "@/lib/engine";
import { loadPlanInput } from "@/lib/engine/loader";
import { DashboardLayoutClient } from "@/components/dashboard/DashboardLayoutClient";
import { StrikeCard } from "@/components/dashboard/StrikeCard";
import { CashflowCard } from "@/components/dashboard/CashflowCard";
import { MonthlyCalendar } from "@/components/dashboard/MonthlyCalendar";
import type { WeeklyPlan } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const supabase = await createServerSupabaseClient();
  let plan: WeeklyPlan;

  try {
    // Load the raw database rows into the engine's input format first
    const input = await loadPlanInput(supabase, userId);
    // Then run the synchronous calculation
    plan = computeWeeklyPlan(input);
  } catch (err) {
    redirect("/settings");
  }

  const { data: currentStrike } = await supabase
    .from("debt_strikes")
    .select("id, status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return (
    <div className="flex flex-col gap-6">
      <DashboardLayoutClient 
        strikeCard={
          <StrikeCard 
            plan={plan} 
            strikeId={currentStrike?.id ?? null} 
            status={currentStrike?.status ?? null} 
          />
        }
        cashflowCard={<CashflowCard plan={plan} />}
        calendar={<MonthlyCalendar plan={plan} />}
      />
    </div>
  );
}
