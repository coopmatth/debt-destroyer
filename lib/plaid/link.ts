import "server-only";
import {
  type CountryCode,
  type LinkTokenCreateRequest,
  type Products,
} from "plaid";
import { plaidClient } from "@/lib/plaid/client";
import { withRetry, toPlaidError, PlaidRequestError } from "@/lib/plaid/errors";
import { encryptAccessToken } from "@/lib/crypto/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapAccount } from "@/lib/plaid/mappers";
import { plaidCountryCodes, plaidProducts, serverEnv } from "@/lib/env";

/**
 * Creates a link_token for Plaid Link.
 *
 * Two modes:
 *   - initial: request products, get a fresh Item
 *   - update:  pass an existing access_token and NO products, which puts Link
 *              into update mode to re-authenticate an item that returned
 *              ITEM_LOGIN_REQUIRED. Sending products here is an error.
 */
export async function createLinkToken(params: {
  userId: string;
  accessToken?: string;
}): Promise<{ linkToken: string; expiration: string }> {
  const env = serverEnv();
  const isUpdateMode = Boolean(params.accessToken);

  const request: LinkTokenCreateRequest = {
    user: { client_user_id: params.userId },
    client_name: "Debt Destroyer",
    language: "en",
    country_codes: plaidCountryCodes() as CountryCode[],
    ...(isUpdateMode
      ? { access_token: params.accessToken }
      : { products: plaidProducts() as Products[] }),
    ...(env.PLAID_WEBHOOK_URL ? { webhook: env.PLAID_WEBHOOK_URL } : {}),
    ...(env.PLAID_REDIRECT_URI ? { redirect_uri: env.PLAID_REDIRECT_URI } : {}),
  };

  const response = await withRetry("link_token_create", () =>
    plaidClient().linkTokenCreate(request),
  );

  return {
    linkToken: response.data.link_token,
    expiration: response.data.expiration,
  };
}

export interface ExchangeResult {
  itemId: string;
  plaidItemId: string;
  institutionName: string | null;
  accountsLinked: number;
}

/**
 * Exchanges a public_token for an access_token, encrypts it, and persists the
 * item plus its accounts.
 *
 * Ordering matters: the token is encrypted before it is written, and the raw
 * value is never logged or returned to the caller. The only thing that leaves
 * this function is our own uuid.
 */
export async function exchangePublicToken(params: {
  userId: string;
  publicToken: string;
}): Promise<ExchangeResult> {
  const client = plaidClient();
  const db = createAdminClient();

  const exchange = await withRetry("item_public_token_exchange", () =>
    client.itemPublicTokenExchange({ public_token: params.publicToken }),
  );

  const accessToken = exchange.data.access_token;
  const plaidItemId = exchange.data.item_id;

  // Institution metadata is cosmetic; a failure here must not lose the token.
  let institutionId: string | null = null;
  let institutionName: string | null = null;
  try {
    const item = await withRetry("item_get", () => client.itemGet({ access_token: accessToken }));
    institutionId = item.data.item.institution_id ?? null;

    if (institutionId) {
      const institution = await withRetry("institutions_get_by_id", () =>
        client.institutionsGetById({
          institution_id: institutionId!,
          country_codes: plaidCountryCodes() as CountryCode[],
        }),
      );
      institutionName = institution.data.institution.name;
    }
  } catch {
    // Leave the names null; the sync job backfills them next run.
  }

  const { ciphertext, keyVersion } = encryptAccessToken(accessToken);

  const { data: itemRow, error: itemError } = await db
    .from("plaid_items")
    .upsert(
      {
        user_id: params.userId,
        plaid_item_id: plaidItemId,
        access_token_encrypted: ciphertext,
        key_version: keyVersion,
        institution_id: institutionId,
        institution_name: institutionName,
        billed_products: plaidProducts(),
        status: "good",
        error_code: null,
      },
      { onConflict: "plaid_item_id" },
    )
    .select("id")
    .single();

  if (itemError || !itemRow) {
    throw new Error(`Failed to persist Plaid item: ${itemError?.message ?? "no row returned"}`);
  }

  // Pull accounts immediately so the dashboard has something to show before the
  // first scheduled sync.
  let accountsLinked = 0;
  try {
    const accounts = await withRetry("accounts_get", () =>
      client.accountsGet({ access_token: accessToken }),
    );

    const rows = accounts.data.accounts.map((account) =>
      mapAccount(account, { userId: params.userId, itemId: itemRow.id }),
    );

    if (rows.length > 0) {
      const { error } = await db.from("accounts").upsert(rows, {
        onConflict: "plaid_account_id",
      });
      if (error) throw new Error(`Failed to persist accounts: ${error.message}`);
      accountsLinked = rows.length;
    }
  } catch (err) {
    const plaid = toPlaidError(err);
    if (plaid) throw new PlaidRequestError(plaid, "accounts_get");
    throw err;
  }

  return {
    itemId: itemRow.id,
    plaidItemId,
    institutionName,
    accountsLinked,
  };
}
