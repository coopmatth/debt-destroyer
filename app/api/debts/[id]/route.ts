import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { updateDebtSchema } from "@/lib/validation/debts";

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

  const parsed = updateDebtSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid update", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // RLS restricts this to the caller's own manual debts, so a wrong id updates
  // nothing rather than someone else's row.
  const { data, error } = await supabase
    .from("debts")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("Failed to update debt", error);
    return NextResponse.json({ error: "Could not update debt" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ debt: data });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Soft delete: past strikes reference this debt, and hard-deleting it would
  // blank out the history that explains where money already went.
  const { data, error } = await supabase
    .from("debts")
    .update({ is_active: false })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Failed to delete debt", error);
    return NextResponse.json({ error: "Could not delete debt" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ deleted: data.id });
}
