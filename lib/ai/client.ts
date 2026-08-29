import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { serverEnv } from "@/lib/env";

/**
 * Gemini, through the Vercel AI SDK.
 *
 * Note on packages: the brief named `@google/generative-ai`, which is Google's
 * own standalone SDK and does not plug into the AI SDK's `generateObject`.
 * `@ai-sdk/google` is the provider that does. (Google's standalone SDK has also
 * been superseded by `@google/genai`, so it was the wrong of the two either
 * way.)
 *
 * Model selection is an alias, not a pin. `gemini-flash-latest` is published by
 * Google precisely so callers track the current Flash release without shipping
 * a new build, which is the auto-updating behaviour asked for.
 *
 * One honest limit on "highest free token allowance": the API exposes no
 * quota metadata, so no code can rank models by free tier. The alias tracks
 * *newest*, which is the closest thing that is actually discoverable — and
 * newest is not automatically most generous. If Google's free limits shift,
 * pin GEMINI_MODEL to whichever model you prefer; nothing else has to change.
 */

/** Tracks the current Flash release without a redeploy. */
const DEFAULT_MODEL = "gemini-flash-latest";

/**
 * Used when the configured model is rejected. An alias can move to a release
 * this key is not enabled for, and a financial dashboard should degrade to an
 * older model rather than lose the feature outright.
 */
const FALLBACK_MODEL = "gemini-2.5-flash";

export class AiUnavailableError extends Error {
  constructor(message = "AI features are not configured on this instance") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

function provider() {
  const apiKey = serverEnv().GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;
  return createGoogleGenerativeAI({ apiKey });
}

export function isAiConfigured(): boolean {
  return Boolean(serverEnv().GOOGLE_GENERATIVE_AI_API_KEY);
}

export function primaryModel(): LanguageModel {
  const google = provider();
  if (!google) throw new AiUnavailableError();
  return google(serverEnv().GEMINI_MODEL || DEFAULT_MODEL);
}

export function fallbackModel(): LanguageModel {
  const google = provider();
  if (!google) throw new AiUnavailableError();
  return google(FALLBACK_MODEL);
}

/** True for the errors that mean "this model id will never work", not "try later". */
function isModelUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("not found") ||
    message.includes("not_found") ||
    message.includes("404") ||
    message.includes("is not supported") ||
    message.includes("unsupported") ||
    message.includes("permission")
  );
}

/**
 * Runs a call against the tracking alias, retrying once on the pinned model.
 *
 * This is what makes an auto-updating alias safe to depend on: if the alias
 * moves somewhere this API key cannot go, the feature keeps working instead of
 * breaking on Google's release schedule.
 */
export async function withModelFallback<T>(
  run: (model: LanguageModel) => Promise<T>,
): Promise<{ result: T; model: string; usedFallback: boolean }> {
  const configured = serverEnv().GEMINI_MODEL || DEFAULT_MODEL;

  try {
    return { result: await run(primaryModel()), model: configured, usedFallback: false };
  } catch (error) {
    if (!isModelUnavailable(error)) throw error;

    console.warn(
      `Gemini model "${configured}" unavailable, falling back to "${FALLBACK_MODEL}"`,
    );
    return {
      result: await run(fallbackModel()),
      model: FALLBACK_MODEL,
      usedFallback: true,
    };
  }
}
