import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { buildWeeklyPlan } from "@/lib/engine";
import { DashboardLayoutClient } from "@/components/dashboard/DashboardLayoutClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const plan = await buildWeeklyPlan(userId);
  if (!plan) redirect("/settings");

  return (
    <div className="flex flex-col gap-6">
      <DashboardLayoutClient plan={plan} />
    </div>
  );
}
