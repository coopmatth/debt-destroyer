import { NextResponse } from "next/server";
import { z } from "zod";
import { createLinkToken } from "@/lib/plaid/link";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadLinkedItem } from "@/lib/plaid/items";
import { PlaidRequestError } from "@/lib/plaid/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // Present when re-authenticating an existing connection (Link update mode).
  itemId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    let accessToken: string | undefined;

    if (parsed.data.itemId) {
      const db = createAdminClient();
      const item = await loadLinkedItem(db, parsed.data.itemId);
      // The admin client bypasses RLS, so ownership must be checked here.
      if (item.userId !== userId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      accessToken = item.accessToken;
    }

    const { linkToken, expiration } = await createLinkToken({ userId, accessToken });
    return NextResponse.json({ linkToken, expiration });
  } catch (err) {
    if (err instanceof PlaidRequestError) {
      console.error("link_token_create failed", {
        code: err.plaid.error_code,
        requestId: err.plaid.request_id,
      });
      return NextResponse.json(
        { error: "Could not start bank connection", code: err.plaid.error_code },
        { status: 502 },
      );
    }
    console.error("link_token_create unexpected failure", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
