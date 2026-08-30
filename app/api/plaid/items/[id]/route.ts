import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { plaidClient } from "@/lib/plaid/client";
import { decryptAccessToken } from "@/lib/crypto/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: RouteContext) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminDb = createAdminClient();

  const { data: item } = await adminDb
    .from("plaid_items")
    .select("access_token_encrypted")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  // Tell Plaid to revoke the access token entirely
  try {
    const accessToken = decryptAccessToken(item.access_token_encrypted);
    await plaidClient().itemRemove({ access_token: accessToken });
  } catch (err) {
    console.error("Failed to revoke item at Plaid, deleting locally anyway", err);
  }

  // Delete from the database (cascades to accounts, transactions, and linked debts)
  await adminDb.from("plaid_items").delete().eq("id", id).eq("user_id", user.id);

  return NextResponse.json({ success: true });
}
