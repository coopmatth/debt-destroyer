import { createAdminClient } from "@/lib/supabase/admin";

interface DetectableTransaction {
  amount_cents: number;
  date: string;
  merchant_name: string | null;
  is_transfer: boolean;
}

export async function autoDetectPayments(
  userId: string,
  newTransactions: DetectableTransaction[],
) {
  const db = createAdminClient();
  const { data: debts } = await db.from("debts").select("*").eq("user_id", userId).eq("is_active", true);

  for (const txn of newTransactions) {
    if (!txn.is_transfer || txn.amount_cents <= 0) continue;

    const matchedDebt = debts?.find(d =>
      d.minimum_payment_cents === txn.amount_cents ||
      (txn.merchant_name && d.name.toLowerCase().includes(txn.merchant_name.toLowerCase()))
    );

    if (matchedDebt && matchedDebt.next_due_date) {
      const diffDays = Math.abs((new Date(txn.date).getTime() - new Date(matchedDebt.next_due_date).getTime()) / 86400000);

      if (diffDays <= 5) {
        await db.from("debts")
          .update({ 
            min_payment_paid_for_due_date: matchedDebt.next_due_date,
            current_balance_cents: Math.max(0, matchedDebt.current_balance_cents - txn.amount_cents)
          })
          .eq("id", matchedDebt.id);
      }
    }
  }
}
