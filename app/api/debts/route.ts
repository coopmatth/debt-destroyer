import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createDebtSchema } from "@/lib/validation/debts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual debt CRUD.
 *
 * These routes use the RLS-scoped client, not the service role: the user's JWT
 * goes to Postgres and the ownership check happens in the database. There is no
 * `.eq("user_id", ...)` to forget here, because forgetting it would return
 * nothing rather than everything.
 */

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("debts")
    .select("*")
    .eq("is_active", true)
    .order("apr", { ascending: false });

  if (error) {
    console.error("Failed to list debts", error);
    return NextResponse.json({ error: "Could not load debts" }, { status: 500 });
  }

  return NextResponse.json({ debts: data });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createDebtSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid debt", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("debts")
    .insert({
      ...parsed.data,
      user_id: user.id,
      // Manual debts carry no linked account. The RLS insert policy requires
      // this to be null, which is what stops a client from claiming a synced row.
      account_id: null,
      apr_type: "manual",
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create debt", error);
    return NextResponse.json({ error: "Could not save debt" }, { status: 500 });
  }

  return NextResponse.json({ debt: data }, { status: 201 });
}
