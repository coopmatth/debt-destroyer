import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncItem } from "@/lib/plaid/sync";
import { itemStatusForError } from "@/lib/plaid/errors";
import {
  parseWebhookBody,
  shouldTriggerSync,
  verifyWebhook,
  webhookDedupeKey,
} from "@/lib/plaid/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  // The raw bytes, untouched — the signature covers exactly this string.
  const rawBody = await request.text();
  const verification = await verifyWebhook(
    rawBody,
    request.headers.get("plaid-verification"),
  );

  if (!verification.valid) {
    console.warn("Rejected Plaid webhook", { reason: verification.reason });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = parseWebhookBody(rawBody);
  if (!body) {
    return NextResponse.json({ error: "Malformed webhook body" }, { status: 400 });
  }

  const db = createAdminClient();
  const dedupeKey = webhookDedupeKey(body, rawBody);

  // The unique constraint on dedupe_key is what makes retries free.
  const { error: insertError } = await db.from("plaid_webhook_events").insert({
    plaid_item_id: body.item_id ?? null,
    webhook_type: body.webhook_type,
    webhook_code: body.webhook_code,
    dedupe_key: dedupeKey,
    payload: JSON.parse(rawBody),
  });

  if (insertError) {
    // 23505 = unique_violation: Plaid retried something we already handled.
    if (insertError.code === "23505") {
      return NextResponse.json({ status: "duplicate" }, { status: 200 });
    }
    console.error("Failed to record webhook", insertError);
    // Non-2xx tells Plaid to retry, which is what we want here.
    return NextResponse.json({ error: "Storage failure" }, { status: 500 });
  }

  if (!body.item_id) {
    await markProcessed(db, dedupeKey);
    return NextResponse.json({ status: "recorded" });
  }

  const { data: item } = await db
    .from("plaid_items")
    .select("id")
    .eq("plaid_item_id", body.item_id)
    .maybeSingle();

  if (!item) {
    await markProcessed(db, dedupeKey, "Unknown item_id");
    return NextResponse.json({ status: "unknown-item" });
  }

  // ITEM webhooks carry the connection state the user must act on.
  if (body.webhook_type === "ITEM") {
    const errorCode =
      body.webhook_code === "PENDING_EXPIRATION"
        ? "PENDING_EXPIRATION"
        : body.error?.error_code;

    const status = errorCode ? itemStatusForError(errorCode) : null;
    if (status) {
      await db
        .from("plaid_items")
        .update({ status, error_code: errorCode ?? null })
        .eq("id", item.id);
    }
  }

  if (shouldTriggerSync(body)) {
    const report = await syncItem(item.id);
    await markProcessed(db, dedupeKey, report.ok ? null : report.error);
    return NextResponse.json({ status: "synced", ok: report.ok });
  }

  await markProcessed(db, dedupeKey);
  return NextResponse.json({ status: "recorded" });
}

async function markProcessed(
  db: ReturnType<typeof createAdminClient>,
  dedupeKey: string,
  error?: string | null,
) {
  await db
    .from("plaid_webhook_events")
    .update({ processed_at: new Date().toISOString(), error: error ?? null })
    .eq("dedupe_key", dedupeKey);
}
