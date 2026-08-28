import type { Database } from "@/types/database.types";

type ItemStatus = Database["public"]["Enums"]["item_status"];

export interface PlaidErrorShape {
  error_type: string;
  error_code: string;
  error_message: string;
  display_message: string | null;
  request_id?: string;
  status?: number;
}

/**
 * Plaid errors arrive as an axios rejection with the useful part buried in
 * `response.data`. Normalize before anything else touches them.
 */
export function toPlaidError(err: unknown): PlaidErrorShape | null {
  if (typeof err !== "object" || err === null) return null;

  const response = (err as { response?: { data?: unknown; status?: number } }).response;
  const data = response?.data;
  if (typeof data !== "object" || data === null) return null;

  const d = data as Record<string, unknown>;
  if (typeof d.error_code !== "string") return null;

  return {
    error_type: typeof d.error_type === "string" ? d.error_type : "UNKNOWN",
    error_code: d.error_code,
    error_message: typeof d.error_message === "string" ? d.error_message : "",
    display_message: typeof d.display_message === "string" ? d.display_message : null,
    request_id: typeof d.request_id === "string" ? d.request_id : undefined,
    status: response?.status,
  };
}

export class PlaidRequestError extends Error {
  constructor(
    readonly plaid: PlaidErrorShape,
    readonly operation: string,
  ) {
    // error_message can contain institution names but never credentials.
    super(`Plaid ${operation} failed: ${plaid.error_code} — ${plaid.error_message}`);
    this.name = "PlaidRequestError";
  }
}

/**
 * Item-level errors mean the connection needs user intervention; we record that
 * on the item so the dashboard can prompt a Link update rather than silently
 * serving stale balances. Anything else is transient or our own bug.
 */
export function itemStatusForError(errorCode: string): ItemStatus | null {
  switch (errorCode) {
    case "ITEM_LOGIN_REQUIRED":
    case "ITEM_LOCKED":
    case "USER_PERMISSION_REVOKED":
      return "login_required";
    case "PENDING_EXPIRATION":
    case "PENDING_DISCONNECT":
      return "pending_expiration";
    case "ITEM_NOT_FOUND":
    case "ACCESS_NOT_GRANTED":
      return "revoked";
    default:
      return null;
  }
}

/** Errors that mean "this item has no such data", not "something broke". */
export function isMissingDataError(errorCode: string): boolean {
  return (
    errorCode === "PRODUCTS_NOT_SUPPORTED" ||
    errorCode === "NO_LIABILITY_ACCOUNTS" ||
    errorCode === "NO_ACCOUNTS"
  );
}

function isRetryable(err: unknown): boolean {
  const plaid = toPlaidError(err);
  if (plaid) {
    if (plaid.error_type === "RATE_LIMIT_EXCEEDED") return true;
    if (plaid.error_code === "INTERNAL_SERVER_ERROR") return true;
    // The institution is briefly unavailable; a later retry usually lands.
    if (plaid.error_code === "INSTITUTION_DOWN") return true;
    return false;
  }
  // Network-level failures with no Plaid body.
  const code = (err as { code?: string })?.code;
  return code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNABORTED";
}

/**
 * Retries only what is actually retryable. Retrying a bad request just burns
 * quota and delays the real error; retrying a rate limit is the whole point.
 */
export async function withRetry<T>(
  operation: string,
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 500 }: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === attempts - 1) break;

      // Exponential backoff with jitter so concurrent item syncs don't
      // synchronize into a thundering herd against the same institution.
      const delay = baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  const plaid = toPlaidError(lastError);
  if (plaid) throw new PlaidRequestError(plaid, operation);
  throw lastError;
}
