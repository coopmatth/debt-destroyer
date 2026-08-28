import type {
  APR,
  AccountBase,
  CreditCardLiability,
  MortgageLiability,
  StudentLoan,
  Transaction,
} from "plaid";
import type { Database, TablesInsert } from "@/types/database.types";

type AccountType = Database["public"]["Enums"]["account_type"];
type DebtKind = Database["public"]["Enums"]["debt_kind"];

/**
 * Pure Plaid → row mapping. No I/O, no clock, no database. Everything here is
 * unit-testable against fixtures, which is what you want for the code deciding
 * which debt gets someone's money.
 */

// -----------------------------------------------------------------------------
// Money
// -----------------------------------------------------------------------------

/**
 * Plaid sends dollars as JSON floats; we store integer cents.
 *
 * `amount * 100` is not safe on its own: 1.005 * 100 is 100.49999999999999 in
 * binary floating point, which rounds to 100 instead of 101. Shifting the
 * exponent in the *decimal* string representation avoids the intermediate
 * multiply entirely.
 */
export function dollarsToCents(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined) return null;
  if (!Number.isFinite(amount)) {
    throw new RangeError(`Cannot convert non-finite amount to cents: ${amount}`);
  }

  const asString = `${amount}`;
  // Values already in exponential form (1e-7) can't take the string shift.
  const shifted = asString.includes("e") || asString.includes("E")
    ? amount * 100
    : Number(`${asString}e2`);

  return Math.round(shifted);
}

/** Balances owed are stored as positive magnitudes regardless of Plaid's sign. */
export function owedCents(amount: number | null | undefined): number {
  const cents = dollarsToCents(amount);
  return cents === null ? 0 : Math.abs(cents);
}

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
// APR selection — the decision that drives the whole avalanche
// -----------------------------------------------------------------------------

export interface EffectiveApr {
  apr: number;
  aprType: string;
}

const APR_PRIORITY = ["purchase_apr", "balance_transfer_apr", "cash_apr", "penalty_apr", "special"];

/**
 * A card can report several APRs at once: a 0% promotional rate on a transferred
 * balance, 24.99% on purchases, 29.99% on cash advances. Ranking the card by any
 * single one of those is wrong.
 *
 * What actually costs money is each rate applied to the balance sitting under
 * it, so we compute the balance-weighted blended APR:
 *
 *     blended = Σ(apr_i × balance_i) / Σ(balance_i)
 *
 * A card with $5,000 at 0% promo and $500 at 24.99% blends to ~2.27%, which is
 * the honest cost of carrying it and correctly ranks it below a small card at
 * 22%. Where issuers omit `balance_subject_to_apr` (it is not universally
 * populated) we fall back to the highest-priority single rate, preferring
 * purchase APR since that is what most revolving balances sit under.
 *
 * Caveat worth surfacing in the UI: a blended rate understates a promo card the
 * week its 0% period expires. Phase 4 should flag promo expiry rather than let
 * the blend quietly bury it.
 */
export function effectiveApr(aprs: APR[]): EffectiveApr {
  if (aprs.length === 0) return { apr: 0, aprType: "unknown" };

  const weighted = aprs.filter(
    (a) => typeof a.balance_subject_to_apr === "number" && a.balance_subject_to_apr > 0,
  );

  const totalBalance = weighted.reduce((sum, a) => sum + (a.balance_subject_to_apr ?? 0), 0);

  if (weighted.length > 0 && totalBalance > 0) {
    if (weighted.length === 1) {
      const only = weighted[0]!;
      return { apr: round4(only.apr_percentage), aprType: only.apr_type };
    }
    const blended = weighted.reduce(
      (sum, a) => sum + a.apr_percentage * (a.balance_subject_to_apr ?? 0),
      0,
    ) / totalBalance;
    return { apr: round4(blended), aprType: "blended" };
  }

  // No usable balances — fall back to a single declared rate by priority.
  for (const type of APR_PRIORITY) {
    const match = aprs.find((a) => a.apr_type === type);
    if (match) return { apr: round4(match.apr_percentage), aprType: match.apr_type };
  }

  const first = aprs[0]!;
  return { apr: round4(first.apr_percentage), aprType: first.apr_type };
}

/** The apr column is numeric(6,4); round here so Postgres never has to. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

// -----------------------------------------------------------------------------
// Liabilities → debts
// -----------------------------------------------------------------------------

export function mapCreditCardToDebt(
  card: CreditCardLiability,
  account: AccountBase,
  ids: { userId: string; accountId: string },
): TablesInsert<"debts"> {
  const { apr, aprType } = effectiveApr(card.aprs);

  return {
    user_id: ids.userId,
    account_id: ids.accountId,
    name: account.official_name ?? account.name,
    kind: "credit_card",
    current_balance_cents: owedCents(account.balances.current),
    statement_balance_cents: dollarsToCents(card.last_statement_balance),
    credit_limit_cents: dollarsToCents(account.balances.limit),
    apr,
    apr_type: aprType,
    minimum_payment_cents: owedCents(card.minimum_payment_amount),
    next_due_date: card.next_payment_due_date ?? null,
    last_payment_date: card.last_payment_date ?? null,
    last_payment_cents: dollarsToCents(card.last_payment_amount),
    is_overdue: card.is_overdue ?? false,
    is_active: true,
  };
}

export function mapStudentLoanToDebt(
  loan: StudentLoan,
  account: AccountBase,
  ids: { userId: string; accountId: string },
): TablesInsert<"debts"> {
  return {
    user_id: ids.userId,
    account_id: ids.accountId,
    name: loan.loan_name ?? account.official_name ?? account.name,
    kind: "student_loan",
    current_balance_cents: owedCents(account.balances.current),
    apr: Math.round(loan.interest_rate_percentage * 10_000) / 10_000,
    apr_type: "interest_rate",
    minimum_payment_cents: owedCents(loan.minimum_payment_amount),
    next_due_date: loan.next_payment_due_date ?? null,
    last_payment_date: loan.last_payment_date ?? null,
    last_payment_cents: dollarsToCents(loan.last_payment_amount),
    is_overdue: loan.is_overdue ?? false,
    is_active: true,
  };
}

export function mapMortgageToDebt(
  mortgage: MortgageLiability,
  account: AccountBase,
  ids: { userId: string; accountId: string },
): TablesInsert<"debts"> {
  return {
    user_id: ids.userId,
    account_id: ids.accountId,
    name: account.official_name ?? account.name,
    kind: "mortgage",
    current_balance_cents: owedCents(account.balances.current),
    apr: mortgage.interest_rate.percentage
      ? Math.round(mortgage.interest_rate.percentage * 10_000) / 10_000
      : 0,
    apr_type: mortgage.interest_rate.type ?? "unknown",
    minimum_payment_cents: owedCents(mortgage.next_monthly_payment),
    next_due_date: mortgage.next_payment_due_date ?? null,
    last_payment_date: mortgage.last_payment_date ?? null,
    last_payment_cents: dollarsToCents(mortgage.last_payment_amount),
    is_overdue: mortgage.past_due_amount ? mortgage.past_due_amount > 0 : false,
    is_active: true,
  };
}

/** Best-effort kind for a loan account Plaid returns no liability detail for. */
export function debtKindForSubtype(subtype: string | null | undefined): DebtKind {
  switch (subtype) {
    case "credit card":
    case "paypal":
      return "credit_card";
    case "student":
      return "student_loan";
    case "mortgage":
    case "home equity":
      return "mortgage";
    case "auto":
      return "auto_loan";
    case "line of credit":
    case "loan":
      return "personal_loan";
    default:
      return "other";
  }
}

// -----------------------------------------------------------------------------
// Transactions
// -----------------------------------------------------------------------------

/**
 * Money moving between the user's own accounts, and payments toward debt, are
 * not living expenses. Counting a $600 card payment as groceries would shrink
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
