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
  /**
   * The users worth refreshing are the ones with a live bank connection.
   *
   * This used to filter on `onboarding_completed_at`, which nothing in the app
   * ever sets — so the scheduled run processed nobody, silently, forever. Keying
   * off plaid_items is both correct and self-maintaining: link a bank and you
   * are in the run; revoke it and you drop out.
   */
  const { data: linkedItems, error } = await db
    .from("plaid_items")
    .select("user_id")
    .neq("status", "revoked");

  if (error) {
    console.error("Could not list users for refresh", error);
    return NextResponse.json({ error: "Could not list users" }, { status: 500 });
  }

  const users = [...new Set((linkedItems ?? []).map((row) => row.user_id))].map((id) => ({
    id,
  }));

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
