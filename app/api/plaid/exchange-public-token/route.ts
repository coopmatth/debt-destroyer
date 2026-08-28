import { NextResponse } from "next/server";
import { z } from "zod";
import { exchangePublicToken } from "@/lib/plaid/link";
import { syncItem } from "@/lib/plaid/sync";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { PlaidRequestError } from "@/lib/plaid/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  publicToken: z.string().min(1),
});

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "publicToken is required" }, { status: 400 });
  }

  try {
    const result = await exchangePublicToken({
      userId,
      publicToken: parsed.data.publicToken,
    });

    // Pull liabilities and transactions right away so the user sees real APRs
    // instead of an empty dashboard. Failures here don't undo the link.
    const sync = await syncItem(result.itemId);

    return NextResponse.json({
      itemId: result.itemId,
      institutionName: result.institutionName,
      accountsLinked: result.accountsLinked,
      synced: sync.ok,
      debtsFound: sync.debtsUpserted,
    });
  } catch (err) {
    if (err instanceof PlaidRequestError) {
      console.error("public_token exchange failed", {
        code: err.plaid.error_code,
        requestId: err.plaid.request_id,
      });
      return NextResponse.json(
        { error: "Could not link account", code: err.plaid.error_code },
        { status: 502 },
      );
    }
    console.error("public_token exchange unexpected failure", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
