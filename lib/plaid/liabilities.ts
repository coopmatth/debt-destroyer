import "server-only";
import type { AccountBase } from "plaid";
import { plaidClient } from "@/lib/plaid/client";
import { withRetry, toPlaidError, isMissingDataError } from "@/lib/plaid/errors";
import type { AdminClient } from "@/lib/supabase/admin";
import type { LinkedItem } from "@/lib/plaid/items";
import type { TablesInsert } from "@/types/database.types";
import {
  mapAccount,
  mapCreditCardToDebt,
  mapMortgageToDebt,
  mapStudentLoanToDebt,
} from "@/lib/plaid/mappers";

export interface LiabilitiesSyncResult {
  accountsUpdated: number;
  debtsUpserted: number;
  skippedNoLiabilities: boolean;
}

/**
 * Pulls /liabilities/get and refreshes both balances and debt terms.
 *
 * `/liabilities/get` returns the account list alongside the liability detail,
 * so one call refreshes balances and APRs together — no separate balance call
 * for these accounts, and no window where a debt's balance and its APR come
 * from different points in time.
 */
export async function syncLiabilities(
  db: AdminClient,
  item: LinkedItem,
): Promise<LiabilitiesSyncResult> {
  const client = plaidClient();

  let response;
  try {
    response = await withRetry("liabilities_get", () =>
      client.liabilitiesGet({ access_token: item.accessToken }),
    );
  } catch (err) {
    const plaid = toPlaidError(err);
    // An item with only checking accounts legitimately has no liabilities.
    if (plaid && isMissingDataError(plaid.error_code)) {
      return { accountsUpdated: 0, debtsUpserted: 0, skippedNoLiabilities: true };
    }
    throw err;
  }

  const { accounts, liabilities } = response.data;

  const accountRows = accounts.map((account) =>
    mapAccount(account, { userId: item.userId, itemId: item.id }),
  );
  if (accountRows.length > 0) {
    const { error } = await db
      .from("accounts")
      .upsert(accountRows, { onConflict: "plaid_account_id" });
    if (error) throw new Error(`Failed to update accounts: ${error.message}`);
  }

  // Debt rows key off our account uuid, so resolve Plaid ids to uuids first.
  const { data: accountIdRows, error: lookupError } = await db
    .from("accounts")
    .select("id, plaid_account_id")
    .eq("item_id", item.id);

  if (lookupError) {
    throw new Error(`Failed to resolve account ids: ${lookupError.message}`);
  }

  const uuidByPlaidId = new Map(
    (accountIdRows ?? []).map((row) => [row.plaid_account_id, row.id]),
  );
  const accountByPlaidId = new Map<string, AccountBase>(
    accounts.map((account) => [account.account_id, account]),
  );

  const debtRows: TablesInsert<"debts">[] = [];

  const resolve = (plaidAccountId: string | null) => {
    if (!plaidAccountId) return null;
    const accountId = uuidByPlaidId.get(plaidAccountId);
    const account = accountByPlaidId.get(plaidAccountId);
    if (!accountId || !account) return null;
    return { accountId, account };
  };

  for (const card of liabilities.credit ?? []) {
    const resolved = resolve(card.account_id);
    if (!resolved) continue;
    debtRows.push(
      mapCreditCardToDebt(card, resolved.account, {
        userId: item.userId,
        accountId: resolved.accountId,
      }),
    );
  }

  for (const loan of liabilities.student ?? []) {
    const resolved = resolve(loan.account_id);
    if (!resolved) continue;
    debtRows.push(
      mapStudentLoanToDebt(loan, resolved.account, {
        userId: item.userId,
        accountId: resolved.accountId,
      }),
    );
  }

  for (const mortgage of liabilities.mortgage ?? []) {
    const resolved = resolve(mortgage.account_id);
    if (!resolved) continue;
    debtRows.push(
      mapMortgageToDebt(mortgage, resolved.account, {
        userId: item.userId,
        accountId: resolved.accountId,
      }),
    );
  }

  if (debtRows.length > 0) {
    // Upsert lists only the columns above, so `min_payment_met_for_cycle` —
    // which the engine owns, not Plaid — survives every sync untouched.
    const { error } = await db.from("debts").upsert(debtRows, { onConflict: "account_id" });
    if (error) throw new Error(`Failed to upsert debts: ${error.message}`);
  }

  await db
    .from("plaid_items")
    .update({ last_liabilities_sync_at: new Date().toISOString() })
    .eq("id", item.id);

  return {
    accountsUpdated: accountRows.length,
    debtsUpserted: debtRows.length,
    skippedNoLiabilities: false,
  };
}

/**
 * Refreshes balances for accounts liabilities does not cover — checking and
 * savings, which is where Total Liquid Cash comes from.
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
