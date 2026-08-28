import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { serverEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS entirely, so it is the only thing that can
 * read Plaid access tokens or write synced balances, APRs, and strike rows.
 *
 * Rules of use:
 *   - Never import from a client component ("server-only" turns that into a
 *     build error rather than a leaked key).
 *   - Always scope queries by user_id yourself. RLS is not there to catch you.
 */
export function createAdminClient() {
  const env = serverEnv();

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "X-Client-Info": "debt-destroyer/sync" } },
    },
  );
}

export type AdminClient = ReturnType<typeof createAdminClient>;
