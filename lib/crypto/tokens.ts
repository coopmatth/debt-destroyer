import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Envelope encryption for Plaid access tokens.
 *
 * A Plaid access_token is a long-lived read credential on someone's bank
 * account. Postgres-at-rest encryption does not help if the database itself is
 * what leaks, so tokens are encrypted in the app with a key that lives only in
 * the environment and never touches the database.
 *
 * Wire format: base64( iv[12] || authTag[16] || ciphertext )
 * AES-256-GCM is authenticated, so tampering fails decryption rather than
 * silently yielding garbage we would then send to Plaid.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the GCM-recommended size
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Bump when introducing a new key so old rows stay decryptable during rotation. */
export const CURRENT_KEY_VERSION = 1;

function encryptionKey(): Buffer {
  const key = Buffer.from(serverEnv().PLAID_TOKEN_ENCRYPTION_KEY, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `PLAID_TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}. ` +
        `Generate one with: openssl rand -base64 32`,
    );
  }
  return key;
}

export function encryptAccessToken(accessToken: string): {
  ciphertext: string;
  keyVersion: number;
} {
  if (!accessToken) throw new Error("Refusing to encrypt an empty access token");

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(accessToken, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64"),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

export function decryptAccessToken(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  if (raw.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("Malformed encrypted access token: payload too short");
  }

  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Never echo the payload or the key state into the error.
    throw new Error(
      "Failed to decrypt Plaid access token — wrong key, or the ciphertext was tampered with",
    );
  }
}

/** Constant-time compare for shared secrets (cron bearer token, webhook checks). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
