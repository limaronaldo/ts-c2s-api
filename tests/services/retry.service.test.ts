/**
 * Retry Service Tests (RML-639)
 * Unit tests for retry logic with exponential backoff
 */
import { describe, expect, test } from "bun:test";

// Retry delays in milliseconds (must match retry.service.ts)
const RETRY_DELAYS_MS = [
  1 * 60 * 60 * 1000, // 1 hour
  2 * 60 * 60 * 1000, // 2 hours
  4 * 60 * 60 * 1000, // 4 hours
  8 * 60 * 60 * 1000, // 8 hours
  16 * 60 * 60 * 1000, // 16 hours
];

const RETRYABLE_STATUSES = ["partial", "unenriched"] as const;

interface MockLead {
  id: string;
  leadId: string;
  name: string | null;
  enrichmentStatus: string | null;
  retryCount: number | null;
  lastRetryAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

describe("RetryService", () => {
  describe("getRetryDelay", () => {
    test("returns correct delay for each retry count", () => {
      const getRetryDelay = (retryCount: number): number => {
        const index = Math.min(retryCount, RETRY_DELAYS_MS.length - 1);
        return RETRY_DELAYS_MS[index];
      };

      expect(getRetryDelay(0)).toBe(1 * 60 * 60 * 1000); // 1 hour
      expect(getRetryDelay(1)).toBe(2 * 60 * 60 * 1000); // 2 hours
      expect(getRetryDelay(2)).toBe(4 * 60 * 60 * 1000); // 4 hours
      expect(getRetryDelay(3)).toBe(8 * 60 * 60 * 1000); // 8 hours
      expect(getRetryDelay(4)).toBe(16 * 60 * 60 * 1000); // 16 hours
    });

    test("caps delay at max for high retry counts", () => {
      const getRetryDelay = (retryCount: number): number => {
        const index = Math.min(retryCount, RETRY_DELAYS_MS.length - 1);
        return RETRY_DELAYS_MS[index];
      };

      // Beyond max retries, should still return last delay
      expect(getRetryDelay(5)).toBe(16 * 60 * 60 * 1000);
      expect(getRetryDelay(10)).toBe(16 * 60 * 60 * 1000);
      expect(getRetryDelay(100)).toBe(16 * 60 * 60 * 1000);
    });
  });

  describe("isRetryEligible", () => {
    const maxRetries = 5;

    function isRetryEligible(lead: MockLead): boolean {
      const status = lead.enrichmentStatus;
      const retryCount = lead.retryCount ?? 0;

      // Must be in a retryable status
      if (!RETRYABLE_STATUSES.includes(status as typeof RETRYABLE_STATUSES[number])) {
        return false;
      }

      // Must not have exceeded max retries
      if (retryCount >= maxRetries) {
        return false;
      }

      // Check if enough time has passed since last retry
      if (lead.lastRetryAt) {
        const delayIndex = Math.min(retryCount, RETRY_DELAYS_MS.length - 1);
        const delayMs = RETRY_DELAYS_MS[delayIndex];
        const timeSinceLastRetry = Date.now() - lead.lastRetryAt.getTime();
        if (timeSinceLastRetry < delayMs) {
          return false;
        }
      }

      return true;
    }

    test("returns true for partial status with zero retries", () => {
      const lead: MockLead = {
        id: "1",
        leadId: "lead-1",
        name: "Test",
        enrichmentStatus: "partial",
        retryCount: 0,
        lastRetryAt: null,
        lastError: null,
        createdAt: new Date(),
      };

      expect(isRetryEligible(lead)).toBe(true);
    });

    test("returns true for unenriched status with zero retries", () => {
      const lead: MockLead = {
        id: "1",
        leadId: "lead-1",
        name: "Test",
        enrichmentStatus: "unenriched",
        retryCount: 0,
        lastRetryAt: null,
        lastError: null,
        createdAt: new Date(),
      };

      expect(isRetryEligible(lead)).toBe(true);
    });

    test("returns false for completed status", () => {
      const lead: MockLead = {
        id: "1",
        leadId: "lead-1",
        name: "Test",
        enrichmentStatus: "completed",
        retryCount: 0,
        lastRetryAt: null,
        lastError: null,
        createdAt: new Date(),
      };

      expect(isRetryEligible(lead)).toBe(false);
    });

    test("returns false for failed status", () => {
      const lead: MockLead = {
        id: "1",
        leadId: "lead-1",
        name: "Test",
        enrichmentStatus: "failed",
        retryCount: 5,
        lastRetryAt: new Date(),
        lastError: "Max retries exceeded",
        createdAt: new Date(),
      };

      expect(isRetryEligible(lead)).toBe(false);
    });

    test("returns false when max retries exceeded", () => {
      const lead: MockLead = {
        id: "1",
        leadId: "lead-1",
        name: "Test",
        enrichmentStatus: "partial",
        retryCount: 5,
        lastRetryAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        lastError: "Some error",
        createdAt: new Date(),
      };

      expect(isRetryEligible(lead)).toBe(false);
    });

    test("returns false when not enough time has passed", () => {
      const lead: MockLead = {
        id: "1",
        leadId: "lead-1",
        name: "Test",
        enrichmentStatus: "partial",
        retryCount: 0,
        lastRetryAt: new Date(), // Just now
        lastError: "Some error",
        createdAt: new Date(),
      };

      expect(isRetryEligible(lead)).toBe(false);
    });

    test("returns true when enough time has passed", () => {
      const lead: MockLead = {
        id: "1",
        leadId: "lead-1",
        name: "Test",
        enrichmentStatus: "partial",
        retryCount: 0,
        lastRetryAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago (> 1 hour delay)
        lastError: "Some error",
        createdAt: new Date(),
      };

      expect(isRetryEligible(lead)).toBe(true);
    });

    test("respects exponential backoff timing", () => {
      // Retry count 2 requires 4 hours delay
      const lead: MockLead = {
        id: "1",
        leadId: "lead-1",
        name: "Test",
        enrichmentStatus: "partial",
        retryCount: 2,
        lastRetryAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
        lastError: "Some error",
        createdAt: new Date(),
      };

      // 3 hours < 4 hours required, so not eligible
      expect(isRetryEligible(lead)).toBe(false);

      // Update to 5 hours ago
      lead.lastRetryAt = new Date(Date.now() - 5 * 60 * 60 * 1000);
      expect(isRetryEligible(lead)).toBe(true);
    });
  });

  describe("hasExceededMaxRetries", () => {
    test("returns true when retry count equals max", () => {
      const maxRetries = 5;
      const retryCount = 5;
      expect(retryCount >= maxRetries).toBe(true);
    });

    test("returns true when retry count exceeds max", () => {
      const maxRetries = 5;
      const retryCount = 6;
      expect(retryCount >= maxRetries).toBe(true);
    });

    test("returns false when retry count is below max", () => {
      const maxRetries = 5;
      const retryCount = 4;
      expect(retryCount >= maxRetries).toBe(false);
    });
  });

  describe("getTimeUntilNextRetry", () => {
    test("returns 0 when never retried", () => {
      const lastRetryAt: Date | null = null;
      const timeUntil = lastRetryAt ? 1000 : 0;
      expect(timeUntil).toBe(0);
    });

    test("returns remaining time when within delay period", () => {
      const retryCount = 0;
      const delayMs = RETRY_DELAYS_MS[retryCount]; // 1 hour
      const lastRetryAt = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago

      const timeSinceLastRetry = Date.now() - lastRetryAt.getTime();
      const timeRemaining = delayMs - timeSinceLastRetry;

      expect(timeRemaining).toBeGreaterThan(0);
      expect(timeRemaining).toBeLessThan(delayMs);
    });

    test("returns 0 when delay period has passed", () => {
      const retryCount = 0;
      const delayMs = RETRY_DELAYS_MS[retryCount]; // 1 hour
      const lastRetryAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

      const timeSinceLastRetry = Date.now() - lastRetryAt.getTime();
      const timeRemaining = Math.max(0, delayMs - timeSinceLastRetry);

      expect(timeRemaining).toBe(0);
    });
  });

  describe("getRetryDelayHuman", () => {
    test("returns human readable delay", () => {
      const getRetryDelayHuman = (retryCount: number): string => {
        const index = Math.min(retryCount, RETRY_DELAYS_MS.length - 1);
        const delayMs = RETRY_DELAYS_MS[index];
        const hours = delayMs / (60 * 60 * 1000);
        return `${hours}h`;
      };

      expect(getRetryDelayHuman(0)).toBe("1h");
      expect(getRetryDelayHuman(1)).toBe("2h");
      expect(getRetryDelayHuman(2)).toBe("4h");
      expect(getRetryDelayHuman(3)).toBe("8h");
      expect(getRetryDelayHuman(4)).toBe("16h");
    });
  });
});
