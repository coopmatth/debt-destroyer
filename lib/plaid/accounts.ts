import "server-only";
import { plaidClient } from "@/lib/plaid/client";
import { withRetry } from "@/lib/plaid/errors";
import type { AdminClient } from "@/lib/supabase/admin";
import type { LinkedItem } from "@/lib/plaid/items";
import { mapAccount } from "@/lib/plaid/mappers";

/**
 * Refreshes balances for every account on an item.
 *
 * This is the whole of what Plaid provides on the balance side now: checking
 * and savings totals feeding Total Liquid Cash. Credit and loan accounts are
 * still stored if the institution returns them, but nothing reads them —
 * debts are entered by hand.
 */
export async function syncBalances(
  db: AdminClient,
  item: LinkedItem,
): Promise<{ accountsUpdated: number }> {
  const response = await withRetry("accounts_balance_get", () =>
    plaidClient().accountsBalanceGet({ access_token: item.accessToken }),
  );

  const rows = response.data.accounts.map((account) =>
    mapAccount(account, { userId: item.userId, itemId: item.id }),
  );

  if (rows.length > 0) {
    const { error } = await db
      .from("accounts")
      .upsert(rows, { onConflict: "plaid_account_id" });
    if (error) throw new Error(`Failed to update balances: ${error.message}`);
  }

  return { accountsUpdated: rows.length };
}
