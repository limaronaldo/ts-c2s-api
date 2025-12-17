/**
 * Retry utility with exponential backoff
 * Reference: Lead Operations Guide - "3 retries max, exponential backoff: 1s, 2s, 4s"
 */

import { enrichmentLogger } from "./logger";

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "onRetry">> & {
  onRetry?: RetryOptions["onRetry"];
} = {
  maxRetries: 3,
  baseDelayMs: 1000, // 1 second
  maxDelayMs: 8000, // 8 seconds max
  shouldRetry: isRetryableError,
};

/**
 * Determine if an error is retryable
 * Only retry on 5xx errors and network failures
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes("fetch failed") ||
      message.includes("network") ||
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("etimedout") ||
      message.includes("socket hang up")
    ) {
      return true;
    }

    // HTTP 5xx errors
    if (message.includes("returned 5") || message.includes("500") || message.includes("502") || message.includes("503") || message.includes("504")) {
      return true;
    }

    // Rate limiting (429) - should retry with backoff
    if (message.includes("429") || message.includes("too many requests")) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate delay for exponential backoff with jitter
 */
function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  // Exponential backoff: 1s, 2s, 4s, 8s...
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);

  // Add jitter (0-25% of delay) to prevent thundering herd
  const jitter = exponentialDelay * Math.random() * 0.25;

  // Cap at max delay
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Execute an async function with retry logic and exponential backoff
 *
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => fetchFromApi(url),
 *   { maxRetries: 3, baseDelayMs: 1000 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt > opts.maxRetries || !opts.shouldRetry(error)) {
        throw error;
      }

      // Calculate delay
      const delayMs = calculateDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);

      // Log retry attempt
      enrichmentLogger.warn(
        {
          attempt,
          maxRetries: opts.maxRetries,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        },
        `Retry attempt ${attempt}/${opts.maxRetries} after ${delayMs}ms`
      );

      // Call optional retry callback
      if (opts.onRetry) {
        opts.onRetry(error, attempt, delayMs);
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Should not reach here, but TypeScript needs this
  throw lastError;
}

/**
 * Create a retryable version of an async function
 *
 * @example
 * ```ts
 * const retryableFetch = createRetryable(
 *   (url: string) => fetch(url),
 *   { maxRetries: 3 }
 * );
 * const response = await retryableFetch('https://api.example.com');
 * ```
 */
export function createRetryable<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: RetryOptions = {}
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => fn(...args), options);
}
