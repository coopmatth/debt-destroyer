import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAllItemsForUser } from "@/lib/plaid/sync";
import { computeAndStoreWeeklyPlan } from "@/lib/engine/loader";
import { generateAndStoreRealityCheck } from "@/lib/ai/reality-check";
import { isAiConfigured } from "@/lib/ai/client";
import { safeEqual } from "@/lib/crypto/tokens";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 60s is the ceiling every Vercel plan allows, so this deploys anywhere. The
 * run is sequential per user and each user has a handful of connections, so a
 * personal instance finishes in seconds. If this ever runs long, the fix is to
 * page through users across several invocations rather than to ask for a
 * longer function.
 */
export const maxDuration = 60;

/**
 * Stop starting AI calls once the function is this far through its budget.
 *
 * Ordering is the point. Syncing balances and recomputing the strike is what
 * the app needs to be correct; the advisory pass is a nicety layered on top. If
 * the clock runs out, the run must lose the nicety and keep the necessity —
 * never the other way round.
 */
const AI_DEADLINE_MS = 40_000;

/**
 * Monday morning: refresh every user's bank data, recompute their strike, then
 * ask the advisor for a second opinion.
 *
 * Triggered by Vercel Cron (see vercel.json). The endpoint is public, so the
 * shared secret is checked in constant time before any work happens — this
 * route can run hundreds of Plaid calls, which makes it worth abusing.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
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

  const aiEnabled = isAiConfigured();

  let synced = 0;
  let planned = 0;
  let advised = 0;
  let aiSkipped = 0;
  const failures: { userId: string; stage: string; error: string }[] = [];

  for (const user of users) {
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
      const { plan } = await computeAndStoreWeeklyPlan(db, user.id);
      planned++;

      if (!aiEnabled) continue;

      if (Date.now() - startedAt > AI_DEADLINE_MS) {
        aiSkipped++;
        continue;
      }

      // The advisory pass never fails the run. A model outage, a rate limit, a
      // retired alias — the deterministic strike is already stored and correct,
      // and the dashboard simply shows it unadjusted.
      try {
        const outcome = await generateAndStoreRealityCheck(db, user.id, plan);
        if (outcome.status === "advised") advised++;
        else aiSkipped++;
      } catch (aiError) {
        aiSkipped++;
        failures.push({
          userId: user.id,
          stage: "reality-check",
          error: aiError instanceof Error ? aiError.message : "unknown",
        });
      }
    } catch (err) {
      failures.push({
        userId: user.id,
        stage: "plan",
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    users: users.length,
    synced,
    planned,
    advised,
    aiSkipped,
    aiEnabled,
    elapsedMs: Date.now() - startedAt,
    failures,
  });
}
