import { NextResponse } from "next/server";
import { syncAllItemsForUser } from "@/lib/plaid/sync";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Manual "refresh my accounts" from the dashboard. */
export async function POST() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reports = await syncAllItemsForUser(userId);

  const failed = reports.filter((r) => !r.ok);
  return NextResponse.json(
    {
      itemsSynced: reports.length - failed.length,
      itemsFailed: failed.length,
      // Surfaces which connection needs re-authentication.
      failures: failed.map((r) => ({ itemId: r.itemId, code: r.error })),
      totals: {
        accountsUpdated: reports.reduce((n, r) => n + r.accountsUpdated, 0),
        debtsUpserted: reports.reduce((n, r) => n + r.debtsUpserted, 0),
        transactionsAdded: reports.reduce((n, r) => n + r.transactionsAdded, 0),
      },
    },
    // Partial success is still success; the body says what failed.
    { status: 200 },
  );
}
