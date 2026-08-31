import "server-only";
import type { RemovedTransaction, Transaction } from "plaid";
import { plaidClient } from "@/lib/plaid/client";
import { withRetry, toPlaidError } from "@/lib/plaid/errors";
import type { AdminClient } from "@/lib/supabase/admin";
import type { LinkedItem } from "@/lib/plaid/items";
import { mapAccount, mapTransaction } from "@/lib/plaid/mappers";

export interface TransactionSyncResult {
  added: number;
  modified: number;
  removed: number;
  cursor: string | null;
  restarted: boolean;
}

const MAX_PAGES = 50; 
const PAGE_SIZE = 500;

export async function syncTransactions(
  db: AdminClient,
  item: LinkedItem,
): Promise<TransactionSyncResult> {
  const client = plaidClient();
  const startingCursor = item.transactionsCursor;

  let attempt = 0;
  let restarted = false;

  while (attempt < 3) {
    attempt++;

    const added: Transaction[] = [];
    const modified: Transaction[] = [];
    const removed: RemovedTransaction[] = [];
    const accountsSeen = new Map<string, ReturnType<typeof mapAccount>>();

    let cursor = startingCursor ?? undefined;
    let hasMore = true;
    let pages = 0;
    let mutated = false;

    while (hasMore && pages < MAX_PAGES) {
      pages++;

      let page;
      try {
        page = await withRetry("transactions_sync", () =>
          client.transactionsSync({
            access_token: item.accessToken,
            ...(cursor ? { cursor } : {}),
            count: PAGE_SIZE,
          }),
        );
      } catch (err) {
        const plaid = toPlaidError(err);
        if (plaid?.error_code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") {
          mutated = true;
          restarted = true;
          break;
        }
        throw err;
      }

      added.push(...page.data.added);
      modified.push(...page.data.modified);
      removed.push(...page.data.removed);

      for (const account of page.data.accounts) {
        accountsSeen.set(
          account.account_id,
          mapAccount(account, { userId: item.userId, itemId: item.id }),
        );
      }

      cursor = page.data.next_cursor;
      hasMore = page.data.has_more;
    }

    if (mutated) continue;

    if (accountsSeen.size > 0) {
      const { error } = await db
        .from("accounts")
        .upsert([...accountsSeen.values()], { onConflict: "plaid_account_id" });
      if (error) throw new Error(`Failed to upsert accounts during sync: ${error.message}`);
    }

    const { data: accountRows, error: lookupError } = await db
      .from("accounts")
      .select("id, plaid_account_id")
      .eq("item_id", item.id);
    if (lookupError) throw new Error(`Failed to resolve account ids: ${lookupError.message}`);

    const uuidByPlaidId = new Map(
      (accountRows ?? []).map((row) => [row.plaid_account_id, row.id]),
    );

    const toRows = (transactions: Transaction[]) =>
      transactions.flatMap((transaction) => {
        const accountId = uuidByPlaidId.get(transaction.account_id);
        if (!accountId) return [];
        return [mapTransaction(transaction, { userId: item.userId, accountId })];
      });

    const upsertRows = [...toRows(added), ...toRows(modified)];

    for (let i = 0; i < upsertRows.length; i += 500) {
      const chunk = upsertRows.slice(i, i + 500);
      const { error } = await db
        .from("transactions")
        .upsert(chunk, { onConflict: "plaid_transaction_id" });
      if (error) throw new Error(`Failed to upsert transactions: ${error.message}`);
    }

    if (removed.length > 0) {
      const ids = removed.map((r) => r.transaction_id);
      for (let i = 0; i < ids.length; i += 500) {
        const { error } = await db
          .from("transactions")
          .delete()
          .in("plaid_transaction_id", ids.slice(i, i + 500));
        if (error) throw new Error(`Failed to delete transactions: ${error.message}`);
      }
    }

    const { error: cursorError } = await db
      .from("plaid_items")
      .update({
        transactions_cursor: cursor ?? null,
        last_transactions_sync_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    if (cursorError) throw new Error(`Failed to persist cursor: ${cursorError.message}`);

    return {
      added: added.length,
      modified: modified.length,
      removed: removed.length,
      cursor: cursor ?? null,
      restarted,
    };
  }

  throw new Error(`transactions_sync kept mutating during pagination`);
}
