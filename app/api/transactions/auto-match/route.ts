import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { autoDetectPayments } from "@/lib/plaid/detection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await autoDetectPayments(userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Manual auto-match failed", err);
    return NextResponse.json({ error: "Could not run auto-match" }, { status: 500 });
  }
}
