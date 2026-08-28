import "server-only";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { serverEnv } from "@/lib/env";

let cached: PlaidApi | null = null;

/**
 * Singleton Plaid client. The SDK exposes exactly two environments —
 * `sandbox` and `production` — since Plaid retired development in 2024.
 */
export function plaidClient(): PlaidApi {
  if (cached) return cached;

  const env = serverEnv();
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env.PLAID_ENV],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": env.PLAID_CLIENT_ID,
        "PLAID-SECRET": env.PLAID_SECRET,
        "Plaid-Version": "2020-09-14",
      },
      timeout: 30_000,
    },
  });

  cached = new PlaidApi(configuration);
  return cached;
}
