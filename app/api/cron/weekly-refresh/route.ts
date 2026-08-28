import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAllItemsForUser } from "@/lib/plaid/sync";
import { computeAndStoreWeeklyPlan } from "@/lib/engine/loader";
import { safeEqual } from "@/lib/crypto/tokens";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Monday morning: refresh every user's bank data, then recompute their strike.
 *
 * Triggered by Vercel Cron (see vercel.json). The endpoint is public, so the
 * shared secret is checked in constant time before any work happens — this
 * route can run hundreds of Plaid calls, which makes it worth abusing.
 */
export async function GET(request: Request) {
  const env = serverEnv();
  if (!env.CRON_SECRET) {
    console.error("CRON_SECRET is not configured; refusing to run the refresh");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!safeEqual(provided, env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const { data: users, error } = await db
    .from("users")
    .select("id")
    .not("onboarding_completed_at", "is", null);

  if (error) {
    console.error("Could not list users for refresh", error);
    return NextResponse.json({ error: "Could not list users" }, { status: 500 });
  }

  let synced = 0;
  let planned = 0;
  const failures: { userId: string; stage: string; error: string }[] = [];

  for (const user of users ?? []) {
    // Per-user isolation: one broken bank connection must not stop the run.
    try {
      await syncAllItemsForUser(user.id);
      synced++;
    } catch (err) {
      failures.push({
        userId: user.id,
        stage: "sync",
        error: err instanceof Error ? err.message : "unknown",
      });
    }

    // Recompute even if the sync failed — a plan from slightly stale balances
    // beats no plan, and the item's error status tells the UI to flag it.
    try {
      await computeAndStoreWeeklyPlan(db, user.id);
      planned++;
    } catch (err) {
      failures.push({
        userId: user.id,
        stage: "plan",
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    users: users?.length ?? 0,
    synced,
    planned,
    failures,
  });
}
