import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { computeWeeklyPlan } from "@/lib/engine";
import { loadPlanInput } from "@/lib/engine/loader";
import { StrikeCard } from "@/components/dashboard/StrikeCard";
import { AllocationBar } from "@/components/dashboard/AllocationBar";
import { Ledger } from "@/components/dashboard/Ledger";
import { DebtRanking } from "@/components/dashboard/DebtRanking";
import { ActionList, Blockers } from "@/components/dashboard/Alerts";
import { Card, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const db = createAdminClient();

  // Computed on the server, not fetched over HTTP from our own API — one less
  // round trip and no risk of the page and the route disagreeing.
  const input = await loadPlanInput(db, userId);
  const plan = computeWeeklyPlan(input);

  const { data: strike } = await db
    .from("debt_strikes")
    .select("id, status")
    .eq("user_id", userId)
    .eq("week_start", plan.weekStart)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      <StrikeCard
        plan={plan}
        strikeId={strike?.id ?? null}
        status={strike?.status ?? null}
      />

      <Blockers plan={plan} />

      {plan.actions.length > 0 ? (
        <Card>
          <CardTitle hint="in order">What to pay</CardTitle>
          <ActionList actions={plan.actions} />
        </Card>
      ) : null}

      <Card>
        <CardTitle hint={`${plan.daysUntilPayday} days to payday`}>
          Where your cash is going
        </CardTitle>
        <AllocationBar plan={plan} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Ledger plan={plan} />
        <DebtRanking plan={plan} />
      </div>
    </div>
  );
}
