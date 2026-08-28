import type { AccountBase, Transaction } from "plaid";
import type { Database, TablesInsert } from "@/types/database.types";
import { dollarsToCents } from "@/lib/money";

type AccountType = Database["public"]["Enums"]["account_type"];

/**
 * Pure Plaid → row mapping. No I/O, no clock, no database.
 *
 * Scope note: Plaid supplies depository balances and transactions only. Debts
 * and bills are entered by hand, so there is deliberately no liability mapping
 * here — see git history for the /liabilities/get version if a card is ever
 * linked directly.
 */

// -----------------------------------------------------------------------------
// Accounts
// -----------------------------------------------------------------------------

export function mapAccountType(plaidType: string): AccountType {
  switch (plaidType) {
    case "depository":
      return "depository";
    case "credit":
      return "credit";
    case "loan":
      return "loan";
    case "investment":
    case "brokerage":
      return "investment";
    default:
      return "other";
  }
}

export function mapAccount(
  account: AccountBase,
  ids: { userId: string; itemId: string },
): TablesInsert<"accounts"> {
  return {
    user_id: ids.userId,
    item_id: ids.itemId,
    plaid_account_id: account.account_id,
    name: account.name,
    official_name: account.official_name ?? null,
    mask: account.mask ?? null,
    type: mapAccountType(account.type),
    subtype: account.subtype ?? null,
    current_balance_cents: dollarsToCents(account.balances.current),
    available_balance_cents: dollarsToCents(account.balances.available),
    credit_limit_cents: dollarsToCents(account.balances.limit),
    iso_currency_code: account.balances.iso_currency_code ?? "USD",
    balances_updated_at: new Date().toISOString(),
    is_active: true,
  };
}

// -----------------------------------------------------------------------------
// Transactions
// -----------------------------------------------------------------------------

/**
 * Money moving between the user's own accounts, and payments toward debt, are
 * not living expenses. Counting a $600 card payment as spending would shrink
 * next week's recommendation by $600 — the engine would punish the user for
 * following its own advice.
 */
const TRANSFER_CATEGORIES = new Set(["TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS"]);

export function isTransferLike(transaction: Transaction): boolean {
  const primary = transaction.personal_finance_category?.primary;
  return primary ? TRANSFER_CATEGORIES.has(primary) : false;
}

export function mapTransaction(
  transaction: Transaction,
  ids: { userId: string; accountId: string },
): TablesInsert<"transactions"> {
  return {
    user_id: ids.userId,
    account_id: ids.accountId,
    plaid_transaction_id: transaction.transaction_id,
    pending_transaction_id: transaction.pending_transaction_id ?? null,
    // Plaid's sign convention preserved: positive means money left the account.
    amount_cents: dollarsToCents(transaction.amount) ?? 0,
    iso_currency_code: transaction.iso_currency_code ?? "USD",
    date: transaction.date,
    authorized_date: transaction.authorized_date ?? null,
    name: transaction.name ?? null,
    merchant_name: transaction.merchant_name ?? null,
    pfc_primary: transaction.personal_finance_category?.primary ?? null,
    pfc_detailed: transaction.personal_finance_category?.detailed ?? null,
    is_pending: transaction.pending ?? false,
    is_transfer: isTransferLike(transaction),
  };
}
