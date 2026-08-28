import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { computeAndStoreWeeklyPlan } from "@/lib/engine/loader";
import { StrikeCard } from "@/components/dashboard/StrikeCard";
import { AllocationBar } from "@/components/dashboard/AllocationBar";
import { Ledger } from "@/components/dashboard/Ledger";
import { DebtRanking } from "@/components/dashboard/DebtRanking";
import { ActionList, Blockers } from "@/components/dashboard/Alerts";
import { CalendarView } from "@/components/dashboard/CalendarView";
import { Card, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const db = createAdminClient();

  const [{ plan }, { data: strike }, { data: debts }, { data: expenses }] =
    await Promise.all([
      computeAndStoreWeeklyPlan(db, userId),
      db
        .from("debt_strikes")
        .select("id, status")
        .eq("user_id", userId)
        .eq("week_start", (await computeAndStoreWeeklyPlan(db, userId)).plan.weekStart)
        .maybeSingle(),
      db.from("debts").select("*").eq("user_id", userId).eq("is_active", true),
      db.from("expenses").select("*").eq("user_id", userId).eq("is_active", true),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <StrikeCard
        plan={plan}
        strikeId={strike?.id ?? null}
        status={strike?.status ?? null}
      />

      <CalendarView
        plan={plan}
        debts={debts ?? []}
        expenses={expenses ?? []}
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
