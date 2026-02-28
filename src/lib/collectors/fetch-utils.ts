/**
 * Shared fetch utilities with retry logic and request spacing.
 */

export interface FetchRetryOptions {
  retries?: number;
  delayMs?: number;
  backoffFactor?: number;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_DELAY_MS = 1000;
const DEFAULT_BACKOFF_FACTOR = 2;

/**
 * Wait for a given number of milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with automatic retry on failure and 429 rate-limit handling.
 * Reads Retry-After header when available, otherwise uses exponential backoff.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: FetchRetryOptions,
): Promise<Response> {
  const retries = options?.retries ?? DEFAULT_RETRIES;
  const baseDelay = options?.delayMs ?? DEFAULT_DELAY_MS;
  const backoffFactor = options?.backoffFactor ?? DEFAULT_BACKOFF_FACTOR;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);

      if (res.status === 429) {
        if (attempt === retries) return res;

        // Check Retry-After header (seconds or HTTP-date)
        const retryAfter = res.headers.get('Retry-After');
        let waitMs: number;
        if (retryAfter) {
          const seconds = parseInt(retryAfter, 10);
          waitMs = isNaN(seconds)
            ? Math.max(0, new Date(retryAfter).getTime() - Date.now())
            : seconds * 1000;
          // Cap at 60s to avoid excessively long waits
          waitMs = Math.min(waitMs, 60_000);
        } else {
          waitMs = baseDelay * Math.pow(backoffFactor, attempt);
        }

        await delay(waitMs);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err as Error;
      if (attempt === retries) break;
      await delay(baseDelay * Math.pow(backoffFactor, attempt));
    }
  }

  throw lastError ?? new Error(`fetchWithRetry failed after ${retries + 1} attempts`);
}
