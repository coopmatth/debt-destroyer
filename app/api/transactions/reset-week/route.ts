import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayInTimezone, startOfWeekMonday } from "@/lib/engine/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  // Use the standard client to verify the user's identity securely
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("timezone")
    .eq("id", user.id)
    .single();

  const today = todayInTimezone(profile?.timezone ?? "UTC");
  const weekStart = startOfWeekMonday(today);

  // Use the admin client to bypass RLS and force the transaction update
  const adminDb = createAdminClient();
  const { error } = await adminDb
    .from("transactions")
    .update({ is_transfer: true })
    .eq("user_id", user.id)
    .gte("date", weekStart)
    .lte("date", today);

  if (error) {
    console.error("Failed to reset spending", error);
    return NextResponse.json({ error: "Could not reset spending" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
