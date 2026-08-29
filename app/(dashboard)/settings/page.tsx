import { redirect } from "next/navigation";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";
import { BudgetForm } from "@/components/settings/BudgetForm";
import { LinkedBanks } from "@/components/settings/LinkedBanks";
import { BillDiscoveryList } from "@/components/settings/BillDiscoveryList";
import { StrategyToggle } from "@/components/settings/StrategyToggle";
import { ManualRealityCheck } from "@/components/settings/ManualRealityCheck";
import { Card, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const supabase = await createServerSupabaseClient();

  const [{ data: profile }, { data: items }, { data: accounts }] = await Promise.all([
    supabase
      .from("users")
      .select(
        "preferred_strategy, weekly_variable_budget_cents, min_cash_buffer_cents, pay_frequency, next_payday, timezone",
      )
      .eq("id", userId)
      .single(),
    supabase
      .from("plaid_items")
      .select("id, institution_name, status, last_transactions_sync_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("accounts")
      .select("id, name, mask, type, is_liquid, available_balance_cents, current_balance_cents")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  if (!profile) redirect("/login");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          These are the inputs the weekly calculation runs on.
        </p>
      </div>

      <Card>
        <CardTitle hint="changes this week's target">Payoff strategy</CardTitle>
        <StrategyToggle current={profile.preferred_strategy} />
        <p className="mt-3 text-sm text-ink-secondary">
          <span className="font-medium text-ink">Avalanche</span> pays the highest
          APR first — least interest paid overall.{" "}
          <span className="font-medium text-ink">Snowball</span> pays the smallest
          balance first.
        </p>
      </Card>

      <BudgetForm settings={profile} />
      
      <ManualRealityCheck />

      <LinkedBanks items={items ?? []} accounts={accounts ?? []} />

      <BillDiscoveryList />
    </div>
  );
}
