"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { PlaidLinkButton } from "@/components/plaid/PlaidLinkButton";
import { formatCents } from "@/lib/format";

interface LinkedItem {
  id: string;
  institution_name: string | null;
  status: string;
  last_transactions_sync_at: string | null;
}

interface LinkedAccount {
  id: string;
  name: string;
  mask: string | null;
  type: string;
  is_liquid: boolean | null;
  available_balance_cents: number | null;
  current_balance_cents: number | null;
}

export function LinkedBanks({
  items,
  accounts,
}: {
  items: LinkedItem[];
  accounts: LinkedAccount[];
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    await fetch("/api/plaid/sync", { method: "POST" });
    setSyncing(false);
    router.refresh();
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-ink-secondary uppercase">
          Linked banks
        </h2>
        {items.length > 0 ? (
          <Button size="sm" onClick={sync} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <EmptyState title="No bank linked">
          Connect a checking account so the app can see your real balance. Only
          balances and transactions are read — debts stay hand-entered.
        </EmptyState>
      ) : (
        <ul className="mb-4 flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-hairline p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink">
                  {item.institution_name ?? "Bank"}
                </span>
                {item.status === "good" ? (
                  <Badge tone="good">✓ Connected</Badge>
                ) : (
                  <Badge tone="critical">▲ Needs reconnecting</Badge>
                )}
              </div>

              <p className="mt-1 text-xs text-ink-muted">
                {item.last_transactions_sync_at
                  ? `Last synced ${new Date(item.last_transactions_sync_at).toLocaleString()}`
                  : "Not synced yet"}
              </p>

              {item.status !== "good" ? (
                <div className="mt-3">
                  <PlaidLinkButton itemId={item.id} label="Reconnect" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {accounts.length > 0 ? (
        <ul className="mb-4 flex flex-col gap-2 border-t border-hairline pt-4">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink">
                {account.name}
                {account.mask ? (
                  <span className="text-ink-muted"> ····{account.mask}</span>
                ) : null}
                {account.is_liquid ? null : (
                  <span className="ml-2 text-xs text-ink-muted">not counted as cash</span>
                )}
              </span>
              <span className="tabular text-ink">
                {formatCents(
                  account.available_balance_cents ?? account.current_balance_cents ?? 0,
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <PlaidLinkButton
        label={items.length > 0 ? "Connect another bank" : "Connect a bank account"}
      />
    </Card>
  );
}
