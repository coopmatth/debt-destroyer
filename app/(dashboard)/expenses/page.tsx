import { redirect } from "next/navigation";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";
import { todayInTimezone } from "@/lib/engine/dates";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";
import { ExpenseList } from "@/components/expenses/ExpenseList";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const supabase = await createServerSupabaseClient();

  const [{ data: expenses }, { data: profile }] = await Promise.all([
    supabase
      .from("expenses")
      .select("*")
      .eq("is_active", true)
      .order("next_due_date", { ascending: true }),
    supabase.from("users").select("timezone").eq("id", userId).single(),
  ]);

  const today = todayInTimezone(profile?.timezone ?? "UTC");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bills</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Anything due before your next payday is held back from the strike.
          Marking a bill paid releases it immediately — otherwise it stops being
          reserved seven days after its due date.
        </p>
      </div>

      <ExpenseList expenses={expenses ?? []} today={today} />

      <div>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-ink-secondary uppercase">
          Add a bill
        </h2>
        <ExpenseForm />
      </div>
    </div>
  );
}
