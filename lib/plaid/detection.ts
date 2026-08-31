import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { isAiConfigured, withModelFallback } from "@/lib/ai/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceExpensePeriod, type ExpenseFrequency, addMonths } from "@/lib/engine/dates";

export async function autoDetectPayments(userId: string, plaidTransactionIds?: string[]) {
  const db = createAdminClient();

  let query = db.from("transactions")
    .select("id, plaid_transaction_id, name, merchant_name, amount_cents, date, is_transfer")
    .eq("user_id", userId)
    .eq("is_transfer", false);

  if (plaidTransactionIds && plaidTransactionIds.length > 0) {
    query = query.in("plaid_transaction_id", plaidTransactionIds);
  } else {
    // If no specific IDs provided, scan the last 14 days of un-transferred transactions
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 14);
    query = query.gte("date", windowStart.toISOString().slice(0, 10));
  }

  const { data: txns } = await query;

  if (!txns || txns.length === 0) return;

  const [debtsRes, expensesRes] = await Promise.all([
    db.from("debts").select("*").eq("user_id", userId).eq("is_active", true),
    db.from("expenses").select("*").eq("user_id", userId).eq("is_active", true)
  ]);

  const debts = debtsRes.data ?? [];
  const expenses = expensesRes.data ?? [];

  if (debts.length === 0 && expenses.length === 0) return;

  // 1. Primary AI Detection Pipeline
  if (isAiConfigured()) {
    const prompt = `
    Match these recent bank transactions to the user's known bills and debts.
    A transaction might cover multiple bills (e.g., a combined electric and internet bill from the same company).
    If a transaction pays a bill or debt, we need to flag it.

    Transactions:
    ${txns.map(t => `ID: ${t.id} | Name: ${t.name} | Merchant: ${t.merchant_name} | Amount: $${(t.amount_cents/100).toFixed(2)} | Date: ${t.date}`).join("\n")}

    Known Bills:
    ${expenses.map(e => `ID: ${e.id} | Name: ${e.name} | Expected Amount: $${(e.amount_cents/100).toFixed(2)}`).join("\n")}

    Known Debts:
    ${debts.map(d => `ID: ${d.id} | Name: ${d.name} | Minimum: $${(d.minimum_payment_cents/100).toFixed(2)}`).join("\n")}
    `;

    const schema = z.object({
      matches: z.array(z.object({
        transactionId: z.string(),
        matchedBillIds: z.array(z.string()),
        matchedDebtIds: z.array(z.string()),
        confidence: z.enum(["high", "medium", "low"])
      }))
    });

    try {
      const { result } = await withModelFallback((model) => generateObject({
        model,
        schema,
        prompt,
        system: "You are a financial categorizer. Match transactions to bills/debts. Be generous with matching company names like REMC to electric/internet bills. If the amounts roughly add up or the names match, associate them.",
        temperature: 0,
      }));

      for (const match of result.object.matches) {
        if ((match.confidence === "high" || match.confidence === "medium") && (match.matchedBillIds.length > 0 || match.matchedDebtIds.length > 0)) {
          
          // Drop it from the variable spending budget
          await db.from("transactions").update({ is_transfer: true }).eq("id", match.transactionId);

          // Auto-advance Bills
          for (const billId of match.matchedBillIds) {
            const bill = expenses.find(e => e.id === billId);
            if (bill) {
              const nextDate = advanceExpensePeriod(bill.next_due_date, bill.frequency as ExpenseFrequency);
              await db.from("expenses").update({
                last_paid_date: bill.next_due_date,
                ...(nextDate ? { next_due_date: nextDate } : {})
              }).eq("id", billId);
            }
          }

          // Auto-advance Debts
          const txnAmount = txns.find(t => t.id === match.transactionId)?.amount_cents ?? 0;
          for (const debtId of match.matchedDebtIds) {
            const debt = debts.find(d => d.id === debtId);
            if (debt && debt.next_due_date) {
              const nextDate = addMonths(debt.next_due_date, 1);
              await db.from("debts").update({
                min_payment_paid_for_due_date: debt.next_due_date,
                next_due_date: nextDate,
                current_balance_cents: Math.max(0, debt.current_balance_cents - txnAmount)
              }).eq("id", debtId);
            }
          }
        }
      }
      return; 
    } catch (err) {
      console.error("AI Detection failed, falling back to programmatic logic:", err);
    }
  }

  // 2. Original Programmatic Fallback (Runs if AI is unconfigured or errors out)
  for (const txn of txns) {
    if (txn.amount_cents <= 0) continue;

    const matchedDebt = debts.find(d =>
      d.minimum_payment_cents === txn.amount_cents ||
      (txn.merchant_name && d.name.toLowerCase().includes(txn.merchant_name.toLowerCase()))
    );

    if (matchedDebt && matchedDebt.next_due_date) {
      const diffDays = Math.abs((new Date(txn.date).getTime() - new Date(matchedDebt.next_due_date).getTime()) / 86400000);
      
      if (diffDays <= 5) {
        const nextDate = addMonths(matchedDebt.next_due_date, 1);
        await db.from("debts").update({ 
          min_payment_paid_for_due_date: matchedDebt.next_due_date,
          next_due_date: nextDate,
          current_balance_cents: Math.max(0, matchedDebt.current_balance_cents - txn.amount_cents)
        }).eq("id", matchedDebt.id);
        
        await db.from("transactions").update({ is_transfer: true }).eq("id", txn.id);
      }
    }
  }
}
