import "server-only";
import { createHash } from "node:crypto";
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { plaidClient } from "@/lib/plaid/client";
import { withRetry } from "@/lib/plaid/errors";
import { safeEqual } from "@/lib/crypto/tokens";

/**
 * Plaid webhook verification.
 *
 * The endpoint is a public URL that triggers bank syncs, so an unverified POST
 * is an unauthenticated way to make us do work — and to feed us fabricated
 * item states. Plaid signs each request with an ES256 JWT in the
 * `plaid-verification` header. Verification is three checks, all required:
 *
 *   1. The JWT verifies against the public key Plaid publishes for its `kid`.
 *   2. `request_body_sha256` matches a SHA-256 of the exact raw body — so a
 *      valid signature cannot be replayed over different content.
 *   3. `iat` is recent, bounding replay of a genuine past webhook.
 *
 * The raw body string must be the untouched bytes: parse JSON only after this
 * passes, never before.
 */

const MAX_AGE_SECONDS = 5 * 60;

// Plaid rotates verification keys; cache by kid to avoid a lookup per webhook.
const keyCache = new Map<string, JWK>();

export interface WebhookVerificationResult {
  valid: boolean;
  reason?: string;
}

export async function verifyWebhook(
  rawBody: string,
  verificationHeader: string | null,
): Promise<WebhookVerificationResult> {
  if (!verificationHeader) {
    return { valid: false, reason: "Missing plaid-verification header" };
  }

  let kid: string;
  try {
    const header = decodeProtectedHeader(verificationHeader);
    if (header.alg !== "ES256") {
      return { valid: false, reason: `Unexpected algorithm: ${header.alg}` };
    }
    if (!header.kid) return { valid: false, reason: "JWT header has no kid" };
    kid = header.kid;
  } catch {
    return { valid: false, reason: "Malformed verification JWT" };
  }

  let jwk = keyCache.get(kid);
  if (!jwk) {
    try {
      const response = await withRetry("webhook_verification_key_get", () =>
        plaidClient().webhookVerificationKeyGet({ key_id: kid }),
      );
      const key = response.data.key;

      // An expired key means the JWT is not currently trustworthy.
      if (key.expired_at !== null && key.expired_at !== undefined) {
        return { valid: false, reason: "Verification key is expired" };
      }

      jwk = { kty: key.kty, crv: key.crv, x: key.x, y: key.y, alg: key.alg } as JWK;
      keyCache.set(kid, jwk);
    } catch {
      return { valid: false, reason: "Could not fetch verification key" };
    }
  }

  try {
    const publicKey = await importJWK(jwk, "ES256");
    const { payload } = await jwtVerify(verificationHeader, publicKey, {
      algorithms: ["ES256"],
      // Plaid's verification JWTs carry no exp; iat is checked explicitly below.
      clockTolerance: 30,
    });

    const issuedAt = typeof payload.iat === "number" ? payload.iat : 0;
    const ageSeconds = Math.floor(Date.now() / 1000) - issuedAt;
    if (!issuedAt || ageSeconds > MAX_AGE_SECONDS) {
      return { valid: false, reason: "Verification JWT is too old" };
    }

    const claimed = payload.request_body_sha256;
    if (typeof claimed !== "string") {
      return { valid: false, reason: "JWT has no request_body_sha256 claim" };
    }

    const actual = createHash("sha256").update(rawBody, "utf8").digest("hex");
    if (!safeEqual(claimed, actual)) {
      return { valid: false, reason: "Body hash does not match signature" };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: "Signature verification failed" };
  }
}

export interface PlaidWebhookBody {
  webhook_type: string;
  webhook_code: string;
  item_id?: string;
  error?: { error_code?: string } | null;
  [key: string]: unknown;
}

export function parseWebhookBody(rawBody: string): PlaidWebhookBody | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (typeof parsed !== "object" || parsed === null) return null;
    const body = parsed as Record<string, unknown>;
    if (typeof body.webhook_type !== "string" || typeof body.webhook_code !== "string") {
      return null;
    }
    return body as PlaidWebhookBody;
  } catch {
    return null;
  }
}

/**
 * Stable key for deduplication. Plaid retries webhooks, and a retry that
 * re-triggers a full sync is wasted quota at best.
 */
export function webhookDedupeKey(body: PlaidWebhookBody, rawBody: string): string {
  const bodyHash = createHash("sha256").update(rawBody, "utf8").digest("hex").slice(0, 32);
  return `${body.item_id ?? "no-item"}:${body.webhook_type}:${body.webhook_code}:${bodyHash}`;
}

/** Which webhook codes are worth a sync. Everything else is recorded only. */
export function shouldTriggerSync(body: PlaidWebhookBody): boolean {
  if (body.webhook_type === "TRANSACTIONS") {
    return (
      body.webhook_code === "SYNC_UPDATES_AVAILABLE" ||
      body.webhook_code === "DEFAULT_UPDATE" ||
      body.webhook_code === "INITIAL_UPDATE" ||
      body.webhook_code === "HISTORICAL_UPDATE"
    );
  }
  return false;
}
