import "server-only";
import type { Database } from "@/types/database.types";
import type { AdminClient } from "@/lib/supabase/admin";
import { decryptAccessToken } from "@/lib/crypto/tokens";
import { itemStatusForError, type PlaidErrorShape } from "@/lib/plaid/errors";

export type PlaidItemRow = Database["public"]["Tables"]["plaid_items"]["Row"];

export interface LinkedItem {
  id: string;
  userId: string;
  plaidItemId: string;
  accessToken: string;
  institutionName: string | null;
  transactionsCursor: string | null;
}

/**
 * Loads an item and decrypts its access token. Every Plaid call funnels through
 * here, which keeps decryption in exactly one place and out of route handlers.
 */
export async function loadLinkedItem(
  db: AdminClient,
  itemId: string,
): Promise<LinkedItem> {
  const { data, error } = await db
    .from("plaid_items")
    .select(
      "id, user_id, plaid_item_id, access_token_encrypted, institution_name, transactions_cursor",
    )
    .eq("id", itemId)
    .single();

  if (error || !data) {
    throw new Error(`Plaid item ${itemId} not found: ${error?.message ?? "no row"}`);
  }

  return {
    id: data.id,
    userId: data.user_id,
    plaidItemId: data.plaid_item_id,
    accessToken: decryptAccessToken(data.access_token_encrypted),
    institutionName: data.institution_name,
    transactionsCursor: data.transactions_cursor,
  };
}

export async function listItemIdsForUser(
  db: AdminClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("plaid_items")
    .select("id")
    .eq("user_id", userId)
    .neq("status", "revoked");

  if (error) throw new Error(`Failed to list Plaid items: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

/**
 * Records a Plaid error against the item. Item-level errors flip the status so
 * the dashboard can prompt re-authentication instead of quietly showing stale
 * balances — a stale balance produces a confidently wrong recommendation.
 */
export async function recordItemError(
  db: AdminClient,
  itemId: string,
  plaidError: PlaidErrorShape,
): Promise<void> {
  const status = itemStatusForError(plaidError.error_code);

  await db
    .from("plaid_items")
    .update({
      error_code: plaidError.error_code,
      ...(status ? { status } : {}),
    })
    .eq("id", itemId);
}

export async function clearItemError(db: AdminClient, itemId: string): Promise<void> {
  await db
    .from("plaid_items")
    .update({ status: "good", error_code: null })
    .eq("id", itemId);
}
