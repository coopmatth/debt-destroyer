"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

/**
 * Browser client. Ships the anon key, which is fine: RLS is the boundary.
 * Note that `plaid_items` columns are grant-restricted — select named columns,
 * never `*`, or Postgres returns "permission denied".
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
