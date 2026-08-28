import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

// The crypto module reads the key through serverEnv(), which validates the
// whole environment — so give it a complete one before importing.
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.PLAID_CLIENT_ID = "client";
  process.env.PLAID_SECRET = "secret";
  process.env.PLAID_ENV = "sandbox";
  process.env.PLAID_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("access token encryption", () => {
  it("round-trips a token", async () => {
    const { encryptAccessToken, decryptAccessToken } = await import("@/lib/crypto/tokens");

    const token = "access-production-11111111-2222-3333-4444-555555555555";
    const { ciphertext, keyVersion } = encryptAccessToken(token);

    expect(keyVersion).toBe(1);
    expect(ciphertext).not.toContain(token);
    expect(decryptAccessToken(ciphertext)).toBe(token);
  });

  it("produces a different ciphertext each time (fresh IV)", async () => {
    const { encryptAccessToken, decryptAccessToken } = await import("@/lib/crypto/tokens");

    const token = "access-production-abc";
    const first = encryptAccessToken(token).ciphertext;
    const second = encryptAccessToken(token).ciphertext;

    // Deterministic ciphertext would leak that two rows hold the same token.
    expect(first).not.toBe(second);
    expect(decryptAccessToken(first)).toBe(token);
    expect(decryptAccessToken(second)).toBe(token);
  });

  it("rejects tampered ciphertext instead of returning garbage", async () => {
    const { encryptAccessToken, decryptAccessToken } = await import("@/lib/crypto/tokens");

    const { ciphertext } = encryptAccessToken("access-production-abc");
    const raw = Buffer.from(ciphertext, "base64");
    // Flip a bit in the ciphertext body.
    raw.writeUInt8(raw.readUInt8(raw.length - 1) ^ 0xff, raw.length - 1);

    expect(() => decryptAccessToken(raw.toString("base64"))).toThrow(/Failed to decrypt/);
  });

  it("rejects a truncated payload", async () => {
    const { decryptAccessToken } = await import("@/lib/crypto/tokens");
    expect(() => decryptAccessToken(Buffer.alloc(8).toString("base64"))).toThrow(
      /too short/,
    );
  });

  it("refuses to encrypt an empty token", async () => {
    const { encryptAccessToken } = await import("@/lib/crypto/tokens");
    expect(() => encryptAccessToken("")).toThrow(/empty access token/);
  });
});

describe("safeEqual", () => {
  it("compares without leaking length-independent timing", async () => {
    const { safeEqual } = await import("@/lib/crypto/tokens");
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
