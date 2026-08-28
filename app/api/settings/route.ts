import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { updateSettingsSchema } from "@/lib/validation/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The user's own settings row. RLS-scoped: the update policy on `users`
 * restricts this to `auth.uid() = id`, so no ownership check is needed here.
 */
export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid settings", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("users")
    .update(parsed.data)
    .eq("id", user.id)
    .select(
      "preferred_strategy, weekly_variable_budget_cents, min_cash_buffer_cents, pay_frequency, next_payday, timezone",
    )
    .single();

  if (error) {
    console.error("Failed to update settings", error);
    return NextResponse.json({ error: "Could not save settings" }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
