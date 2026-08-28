import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { computeWeeklyPlan } from "@/lib/engine";
import { computeAndStoreWeeklyPlan, loadPlanInput } from "@/lib/engine/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * This week's Debt Destroyer plan.
 *
 *   GET  — compute and return, no writes. Safe for a dashboard render.
 *   POST — compute and store the strike. Idempotent per (user_id, week_start).
 *
 * The service-role client is required for the write because `debt_strikes` has
 * no client INSERT policy: a recommendation is computed, never claimed.
 */
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = createAdminClient();
    const input = await loadPlanInput(db, userId);
    return NextResponse.json({ plan: computeWeeklyPlan(input), persisted: false });
  } catch (err) {
    console.error("Weekly plan computation failed", err);
    return NextResponse.json({ error: "Could not compute this week's plan" }, { status: 500 });
  }
}

export async function POST() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = createAdminClient();
    const { plan, persisted } = await computeAndStoreWeeklyPlan(db, userId);
    return NextResponse.json({ plan, persisted });
  } catch (err) {
    console.error("Weekly plan persistence failed", err);
    return NextResponse.json({ error: "Could not save this week's plan" }, { status: 500 });
  }
}
