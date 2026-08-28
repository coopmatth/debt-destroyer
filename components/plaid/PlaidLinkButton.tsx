"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { Button } from "@/components/ui";

/**
 * Plaid Link.
 *
 * The link_token is minted server-side (it needs the secret), Link hands back a
 * public_token, and the exchange route swaps it for an access_token that never
 * reaches the browser. `itemId` puts Link into update mode to re-authenticate a
 * connection that has expired.
 */
export function PlaidLinkButton({
  itemId,
  label = "Connect a bank account",
}: {
  itemId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchToken() {
      const response = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemId ? { itemId } : {}),
      });

      if (cancelled) return;

      if (!response.ok) {
        setError("Could not start the bank connection.");
        return;
      }

      const body = await response.json();
      setLinkToken(body.linkToken);
    }

    void fetchToken();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setBusy(true);
      const response = await fetch("/api/plaid/exchange-public-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicToken }),
      });
      setBusy(false);

      if (!response.ok) {
        setError("Linked at the bank, but saving it failed. Try again.");
        return;
      }

      router.refresh();
    },
    [router],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken) => {
      // In update mode Link resolves with a null public_token — there is no new
      // item to exchange, the existing one was just re-authenticated.
      if (!publicToken) {
        router.refresh();
        return;
      }
      void onSuccess(publicToken);
    },
  });

  return (
    <div>
      <Button
        variant="primary"
        onClick={() => open()}
        disabled={!ready || !linkToken || busy}
      >
        {busy ? "Importing…" : label}
      </Button>
      {error ? (
        <p className="mt-2 text-sm text-critical" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
