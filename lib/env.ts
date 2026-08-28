import { z } from "zod";

/**
 * Fail fast and loudly on misconfiguration. A missing PLAID_SECRET should break
 * at boot with a readable message, not at 3am inside a cron run as a 400 from
 * Plaid that nobody sees.
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  PLAID_CLIENT_ID: z.string().min(1),
  PLAID_SECRET: z.string().min(1),
  // The SDK itself only ships `sandbox` and `production`; Plaid retired the
  // development environment in 2024.
  PLAID_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  // Depository accounts only: balances and transactions. Debts and bills
  // are entered by hand, so Liabilities is not requested.
  PLAID_PRODUCTS: z.string().default("transactions"),
  PLAID_COUNTRY_CODES: z.string().default("US"),
  PLAID_REDIRECT_URI: z.string().url().optional(),
  PLAID_WEBHOOK_URL: z.string().url().optional(),

  // 32 raw bytes, base64 encoded: openssl rand -base64 32
  PLAID_TOKEN_ENCRYPTION_KEY: z.string().min(1),

  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  CRON_SECRET: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Server-only. Importing this from a client component is a build error waiting
 * to happen — the values include the service role key.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${missing}`);
  }

  cached = parsed.data;
  return cached;
}

export function plaidProducts(): string[] {
  return serverEnv()
    .PLAID_PRODUCTS.split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function plaidCountryCodes(): string[] {
  return serverEnv()
    .PLAID_COUNTRY_CODES.split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}
