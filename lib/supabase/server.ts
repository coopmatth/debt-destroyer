import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";
import { serverEnv } from "@/lib/env";

/**
 * Request-scoped client that carries the user's JWT, so every query is filtered
 * by RLS. This is what server components and user-facing route handlers use.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const env = serverEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a server component, where cookies are read-only.
            // Session refresh happens in middleware instead; safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Resolves the caller's user id, or null when unauthenticated. Uses getUser()
 * rather than getSession() — getSession trusts the cookie as-is, getUser
 * revalidates the JWT with the auth server.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
