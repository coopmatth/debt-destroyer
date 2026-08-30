import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { toPlaidError } from "@/lib/plaid/errors";
import {
  clearItemError,
  listItemIdsForUser,
  loadLinkedItem,
  recordItemError,
} from "@/lib/plaid/items";
import { syncBalances } from "@/lib/plaid/accounts";
import { syncTransactions } from "@/lib/plaid/transactions";
import { syncLiabilities } from "@/lib/plaid/liabilities";

export interface ItemSyncReport {
  itemId: string;
  ok: boolean;
  accountsUpdated: number;
  transactionsAdded: number;
  transactionsModified: number;
  transactionsRemoved: number;
  error?: string;
}

export async function syncItem(itemId: string): Promise<ItemSyncReport> {
  const db = createAdminClient();
  const report: ItemSyncReport = {
    itemId,
    ok: false,
    accountsUpdated: 0,
    transactionsAdded: 0,
    transactionsModified: 0,
    transactionsRemoved: 0,
  };

  try {
    const item = await loadLinkedItem(db, itemId);

    const balances = await syncBalances(db, item);
    report.accountsUpdated = balances.accountsUpdated;

    try {
      await syncLiabilities(db, item);
    } catch (e) {
      // Silently skip if the linked bank connection does not support or have credit products
    }

    const transactions = await syncTransactions(db, item);
    report.transactionsAdded = transactions.added;
    report.transactionsModified = transactions.modified;
    report.transactionsRemoved = transactions.removed;

    await clearItemError(db, itemId);
    report.ok = true;
  } catch (err) {
    const plaid = toPlaidError(err);
    if (plaid) await recordItemError(db, itemId, plaid);

    report.error =
      plaid?.error_code ?? (err instanceof Error ? err.message : "Unknown sync failure");
  }

  return report;
}

export async function syncAllItemsForUser(userId: string): Promise<ItemSyncReport[]> {
  const db = createAdminClient();
  const itemIds = await listItemIdsForUser(db, userId);

  const reports: ItemSyncReport[] = [];
  for (const itemId of itemIds) {
    reports.push(await syncItem(itemId));
  }
  return reports;
}
