import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { updateExpenseSchema } from "@/lib/validation/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateExpenseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid update", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("expenses")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("Failed to update expense", error);
    return NextResponse.json({ error: "Could not update bill" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ expense: data });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error, count } = await supabase
    .from("expenses")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    console.error("Failed to delete expense", error);
    return NextResponse.json({ error: "Could not delete bill" }, { status: 500 });
  }
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ deleted: id });
}
