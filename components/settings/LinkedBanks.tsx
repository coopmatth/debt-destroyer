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
  const [busyId, setBusyId] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    await fetch("/api/plaid/sync", { method: "POST" });
    setSyncing(false);
    router.refresh();
  }

  async function disconnectItem(id: string) {
    if (!confirm("Are you sure? This permanently removes the bank connection and deletes all its synced accounts, debts, and transactions.")) return;
    setBusyId(id);
    await fetch(`/api/plaid/items/${id}`, { method: "DELETE" });
    setBusyId(null);
    router.refresh();
  }

  async function hideAccount(id: string) {
    if (!confirm("Hide this account? It will be removed from your dashboard and cash flow calculations.")) return;
    setBusyId(id);
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    setBusyId(null);
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
          Connect a checking account so the app can see your real balance.
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

              <div className="mt-3 flex flex-wrap gap-2">
                {item.status !== "good" ? (
                  <PlaidLinkButton itemId={item.id} label="Reconnect" />
                ) : null}
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busyId === item.id}
                  onClick={() => disconnectItem(item.id)}
                >
                  {busyId === item.id ? "Disconnecting…" : "Disconnect Bank"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {accounts.length > 0 ? (
        <ul className="mb-4 flex flex-col gap-2 border-t border-hairline pt-4">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-3 text-sm border-b border-hairline/50 pb-2 last:border-0 last:pb-0">
              <div className="flex flex-col">
                <span className="text-ink">
                  {account.name}
                  {account.mask ? (
                    <span className="text-ink-muted"> ····{account.mask}</span>
                  ) : null}
                </span>
                {!account.is_liquid ? (
                  <span className="text-[10px] text-ink-muted">not counted as cash</span>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular text-ink font-medium">
                  {formatCents(
                    account.available_balance_cents ?? account.current_balance_cents ?? 0,
                  )}
                </span>
                <button
                  title="Remove Account"
                  disabled={busyId === account.id}
                  onClick={() => hideAccount(account.id)}
                  className="text-ink-muted hover:text-critical transition p-1"
                >
                  ✕
                </button>
              </div>
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
