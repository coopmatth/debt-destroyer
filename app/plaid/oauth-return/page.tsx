"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { PLAID_LINK_TOKEN_KEY } from "@/components/plaid/PlaidLinkButton";
import { Button, Card } from "@/components/ui";

/**
 * Where the bank sends you back to.
 *
 * Most large US banks authenticate through OAuth: Link hands the browser to the
 * bank's own site, and the bank returns it here. Resuming requires the *same*
 * link_token that started the flow — a fresh one begins again from scratch —
 * plus the full return URL, which carries the state Plaid matches against.
 *
 * This route must be registered as an allowed redirect URI in the Plaid
 * dashboard, and PLAID_REDIRECT_URI must point at it, or OAuth banks refuse the
 * handoff.
 */

/** Empty string means "checked, and there is nothing stored" — distinct from
 *  null, which means "server render, not checked yet". */
const NO_TOKEN = "";

function subscribe() {
  // Read once on mount; nothing else in this tab mutates the key.
  return () => {};
}

function readStoredToken(): string {
  try {
    return window.localStorage.getItem(PLAID_LINK_TOKEN_KEY) ?? NO_TOKEN;
  } catch {
    return NO_TOKEN;
  }
}

export default function PlaidOAuthReturnPage() {
  const router = useRouter();

  // localStorage is an external store, so read it through the API built for
  // that — it hydrates cleanly instead of tearing between server and client.
  const storedToken = useSyncExternalStore(subscribe, readStoredToken, () => null);

  const [phase, setPhase] = useState<"resuming" | "saving" | "error">("resuming");
  const [message, setMessage] = useState("");

  const linkToken = storedToken ? storedToken : null;
  const storageChecked = storedToken !== null;
  const missingToken = storageChecked && storedToken === NO_TOKEN;

  const { open, ready } = usePlaidLink({
    token: linkToken,
    // Tells Plaid which OAuth flow this is the tail end of.
    receivedRedirectUri: typeof window === "undefined" ? undefined : window.location.href,
    onSuccess: (publicToken) => {
      if (!publicToken) {
        router.replace("/settings");
        return;
      }

      void (async () => {
        setPhase("saving");
        const response = await fetch("/api/plaid/exchange-public-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicToken }),
        });

        try {
          window.localStorage.removeItem(PLAID_LINK_TOKEN_KEY);
        } catch {
          // Nothing to clean up.
        }

        if (!response.ok) {
          setPhase("error");
          setMessage("Your bank approved the connection, but saving it failed.");
          return;
        }

        router.replace("/settings");
      })();
    },
    onExit: () => {
      router.replace("/settings");
    },
  });

  // Reopen Link as soon as it is ready; the user should not have to tap again.
  useEffect(() => {
    if (ready && linkToken && phase === "resuming") open();
  }, [ready, linkToken, phase, open]);

  const failed = phase === "error" || missingToken;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Card>
        {failed ? (
          <div>
            <p className="font-medium text-ink">Could not finish connecting</p>
            <p className="mt-1 text-sm text-ink-secondary">
              {message ||
                "This browser has no record of the connection that started. Go back to settings and try again."}
            </p>
            <div className="mt-4">
              <Button onClick={() => router.replace("/settings")}>Back to settings</Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="font-medium text-ink">
              {phase === "saving" ? "Saving your accounts…" : "Finishing up with your bank…"}
            </p>
            <p className="mt-1 text-sm text-ink-secondary">
              This takes a moment. Do not close the tab.
            </p>
          </div>
        )}
      </Card>
    </main>
  );
}
