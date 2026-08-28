import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createExpenseSchema } from "@/lib/validation/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("is_active", true)
    .order("next_due_date", { ascending: true });

  if (error) {
    console.error("Failed to list expenses", error);
    return NextResponse.json({ error: "Could not load bills" }, { status: 500 });
  }

  return NextResponse.json({ expenses: data });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createExpenseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bill", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("expenses")
    .insert({ ...parsed.data, user_id: user.id, source: "manual" })
    .select()
    .single();

  if (error) {
    console.error("Failed to create expense", error);
    return NextResponse.json({ error: "Could not save bill" }, { status: 500 });
  }

  return NextResponse.json({ expense: data }, { status: 201 });
}
