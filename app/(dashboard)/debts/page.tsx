import { redirect } from "next/navigation";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";
import { todayInTimezone } from "@/lib/engine/dates";
import { DebtList } from "@/components/debts/DebtList";
import { StrategyToggle } from "@/components/settings/StrategyToggle";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const supabase = await createServerSupabaseClient();

  const [{ data: debts }, { data: profile }] = await Promise.all([
    supabase.from("debts").select("*").eq("user_id", userId).eq("is_active", true).order("apr", { ascending: false }),
    supabase.from("users").select("preferred_strategy, timezone").eq("id", userId).single(),
  ]);

  const today = todayInTimezone(profile?.timezone ?? "UTC");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Debts</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Enter each card or loan by hand. The APR and minimum are what the
            algorithm ranks on.
          </p>
        </div>
        <StrategyToggle current={profile?.preferred_strategy ?? "avalanche"} />
      </div>

      <DebtList debts={debts ?? []} today={today} />
    </div>
  );
}
