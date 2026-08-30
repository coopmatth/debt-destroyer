import "server-only";
import { plaidClient } from "@/lib/plaid/client";
import { withRetry } from "@/lib/plaid/errors";
import type { AdminClient } from "@/lib/supabase/admin";
import type { LinkedItem } from "@/lib/plaid/items";
import { dollarsToCents } from "@/lib/money";

export async function syncLiabilities(
  db: AdminClient,
  item: LinkedItem,
): Promise<{ debtsUpdated: number }> {
  const response = await withRetry("liabilities_get", () =>
    plaidClient().liabilitiesGet({ access_token: item.accessToken }),
  );

  const { data: accounts } = await db
    .from("accounts")
    .select("id, plaid_account_id")
    .eq("item_id", item.id);
    
  const accountMap = new Map((accounts ?? []).map((a) => [a.plaid_account_id, a.id]));
  
  // Fetch existing debts to prevent overwriting manual fixes with Plaid's zeros
  const { data: existingDebts } = await db
    .from("debts")
    .select("account_id, apr, minimum_payment_cents")
    .in("account_id", Array.from(accountMap.values()));
    
  const existingMap = new Map((existingDebts ?? []).map((d) => [d.account_id, d]));
  const upsertRows = [];

  for (const credit of response.data.liabilities.credit ?? []) {
    if (!credit.account_id) continue;

    const accountId = accountMap.get(credit.account_id);
    if (!accountId) continue;
    
    const existing = existingMap.get(accountId);
    const accountInfo = response.data.accounts.find((a) => a.account_id === credit.account_id);
    
    const plaidApr = credit.aprs?.find((a) => a.apr_type === "purchase_apr")?.apr_percentage 
      ?? credit.aprs?.[0]?.apr_percentage 
      ?? 0;
      
    const plaidMin = dollarsToCents(credit.minimum_payment_amount) ?? 0;

    // If Plaid sends a 0, retain the user's manual override
    const finalApr = plaidApr > 0 ? plaidApr : (existing?.apr ?? 0);
    const finalMin = plaidMin > 0 ? plaidMin : (existing?.minimum_payment_cents ?? 0);

    upsertRows.push({
      user_id: item.userId,
      account_id: accountId,
      name: accountInfo?.name ?? "Credit Card",
      kind: "credit_card" as const,
      current_balance_cents: dollarsToCents(accountInfo?.balances.current) ?? 0,
      apr: finalApr,
      apr_type: "synced",
      minimum_payment_cents: finalMin,
      next_due_date: credit.next_payment_due_date ?? null,
      is_active: true,
    });
  }
  
  if (upsertRows.length > 0) {
    const { error } = await db.from("debts").upsert(upsertRows, { onConflict: "account_id" });
    if (error) console.error("Failed to sync liabilities", error);
  }

  return { debtsUpdated: upsertRows.length };
}
