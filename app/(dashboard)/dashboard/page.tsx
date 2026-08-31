import { redirect } from "next/navigation";
import { getAuthenticatedUserId, createServerSupabaseClient } from "@/lib/supabase/server";
import { computeWeeklyPlan } from "@/lib/engine";
import { DashboardLayoutClient } from "@/components/dashboard/DashboardLayoutClient";
import { StrikeCard } from "@/components/dashboard/StrikeCard";
import { CashflowCard } from "@/components/dashboard/CashflowCard";
import { MonthlyCalendar } from "@/components/dashboard/MonthlyCalendar";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  // Revert to passing the ID directly
  const plan = await computeWeeklyPlan(userId);
  if (!plan) redirect("/settings");

  // Fix the table name to match your database schema ("debt_strikes")
  const supabase = await createServerSupabaseClient();
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
