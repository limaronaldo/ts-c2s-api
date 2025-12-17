import { describe, test, expect, mock } from "bun:test";
import { withRetry, isRetryableError, createRetryable } from "../../src/utils/retry";

describe("retry utility", () => {
  describe("isRetryableError", () => {
    test("returns true for network errors", () => {
      expect(isRetryableError(new Error("fetch failed"))).toBe(true);
      expect(isRetryableError(new Error("ECONNREFUSED"))).toBe(true);
      expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
      expect(isRetryableError(new Error("ETIMEDOUT"))).toBe(true);
      expect(isRetryableError(new Error("socket hang up"))).toBe(true);
    });

    test("returns true for 5xx errors", () => {
      expect(isRetryableError(new Error("Server returned 500"))).toBe(true);
      expect(isRetryableError(new Error("returned 502"))).toBe(true);
      expect(isRetryableError(new Error("503 Service Unavailable"))).toBe(true);
      expect(isRetryableError(new Error("504 Gateway Timeout"))).toBe(true);
    });

    test("returns true for rate limiting", () => {
      expect(isRetryableError(new Error("429 Too Many Requests"))).toBe(true);
      expect(isRetryableError(new Error("too many requests"))).toBe(true);
    });

    test("returns false for client errors", () => {
      expect(isRetryableError(new Error("400 Bad Request"))).toBe(false);
      expect(isRetryableError(new Error("401 Unauthorized"))).toBe(false);
      expect(isRetryableError(new Error("404 Not Found"))).toBe(false);
    });

    test("returns false for non-Error values", () => {
      expect(isRetryableError("error")).toBe(false);
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
    });
  });

  describe("withRetry", () => {
    test("returns result on first success", async () => {
      const fn = mock(() => Promise.resolve("success"));
      const result = await withRetry(fn, { maxRetries: 3 });
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("retries on retryable error and succeeds", async () => {
      let attempt = 0;
      const fn = mock(() => {
        attempt++;
        if (attempt < 3) {
          return Promise.reject(new Error("ECONNRESET"));
        }
        return Promise.resolve("success after retry");
      });

      const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
      expect(result).toBe("success after retry");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test("throws after max retries exceeded", async () => {
      const fn = mock(() => Promise.reject(new Error("ECONNREFUSED")));

      await expect(
        withRetry(fn, { maxRetries: 2, baseDelayMs: 10 })
      ).rejects.toThrow("ECONNREFUSED");
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    test("does not retry non-retryable errors", async () => {
      const fn = mock(() => Promise.reject(new Error("404 Not Found")));

      await expect(
        withRetry(fn, { maxRetries: 3, baseDelayMs: 10 })
      ).rejects.toThrow("404 Not Found");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("calls onRetry callback", async () => {
      let attempt = 0;
      const fn = mock(() => {
        attempt++;
        if (attempt < 2) {
          return Promise.reject(new Error("500 Internal Server Error"));
        }
        return Promise.resolve("success");
      });

      const onRetry = mock(() => {});

      await withRetry(fn, { maxRetries: 3, baseDelayMs: 10, onRetry });
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    test("respects custom shouldRetry function", async () => {
      const fn = mock(() => Promise.reject(new Error("custom error")));
      const shouldRetry = mock(() => true);

      await expect(
        withRetry(fn, { maxRetries: 2, baseDelayMs: 10, shouldRetry })
      ).rejects.toThrow("custom error");

      expect(fn).toHaveBeenCalledTimes(3);
      expect(shouldRetry).toHaveBeenCalled();
    });
  });

  describe("createRetryable", () => {
    test("creates a retryable function", async () => {
      const originalFn = mock((x: number) => Promise.resolve(x * 2));
      const retryableFn = createRetryable(originalFn, { maxRetries: 3 });

      const result = await retryableFn(5);
      expect(result).toBe(10);
      expect(originalFn).toHaveBeenCalledWith(5);
    });

    test("retryable function retries on failure", async () => {
      let attempt = 0;
      const originalFn = mock((x: number) => {
        attempt++;
        if (attempt < 2) {
          return Promise.reject(new Error("ETIMEDOUT"));
        }
        return Promise.resolve(x * 2);
      });

      const retryableFn = createRetryable(originalFn, { maxRetries: 3, baseDelayMs: 10 });
      const result = await retryableFn(5);
      expect(result).toBe(10);
      expect(originalFn).toHaveBeenCalledTimes(2);
    });
  });
});
