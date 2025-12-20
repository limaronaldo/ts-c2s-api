/**
 * Retry Service (RML-639)
 *
 * Handles retry logic for failed lead enrichments with exponential backoff.
 * - Max 5 retries with delays: 1h, 2h, 4h, 8h, 16h
 * - Tracks retry count and last error per lead
 * - Marks leads as 'failed' after max retries
 */

import { getConfig } from "../config";
import { logger } from "../utils/logger";

const retryLogger = logger.child({ module: "retry" });

// Retry delays in milliseconds (exponential backoff)
const RETRY_DELAYS_MS = [
  1 * 60 * 60 * 1000, // 1 hour
  2 * 60 * 60 * 1000, // 2 hours
  4 * 60 * 60 * 1000, // 4 hours
  8 * 60 * 60 * 1000, // 8 hours
  16 * 60 * 60 * 1000, // 16 hours
];

// Statuses eligible for retry
export const RETRYABLE_STATUSES = ["partial", "unenriched"] as const;
export type RetryableStatus = (typeof RETRYABLE_STATUSES)[number];

export interface RetryableLead {
  id: string;
  leadId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  enrichmentStatus: string | null;
  retryCount: number | null;
  lastRetryAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

export class RetryService {
  private readonly maxRetries: number;

  constructor() {
    const config = getConfig();
    this.maxRetries = config.RETRY_MAX_ATTEMPTS;
  }

  /**
   * Check if a lead is eligible for retry based on status, count, and timing
   */
  isRetryEligible(lead: RetryableLead): boolean {
    const status = lead.enrichmentStatus;
    const retryCount = lead.retryCount ?? 0;

    // Must be in a retryable status
    if (!RETRYABLE_STATUSES.includes(status as RetryableStatus)) {
      return false;
    }

    // Must not have exceeded max retries
    if (retryCount >= this.maxRetries) {
      return false;
    }

    // Check if enough time has passed since last retry
    if (lead.lastRetryAt) {
      const delayMs = this.getRetryDelay(retryCount);
      const timeSinceLastRetry = Date.now() - lead.lastRetryAt.getTime();
      if (timeSinceLastRetry < delayMs) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the delay before next retry based on current retry count
   */
  getRetryDelay(retryCount: number): number {
    const index = Math.min(retryCount, RETRY_DELAYS_MS.length - 1);
    return RETRY_DELAYS_MS[index];
  }

  /**
   * Get human-readable retry delay
   */
  getRetryDelayHuman(retryCount: number): string {
    const delayMs = this.getRetryDelay(retryCount);
    const hours = delayMs / (60 * 60 * 1000);
    return `${hours}h`;
  }

  /**
   * Check if lead has exceeded max retries
   */
  hasExceededMaxRetries(lead: RetryableLead): boolean {
    const retryCount = lead.retryCount ?? 0;
    return retryCount >= this.maxRetries;
  }

  /**
   * Get time until next retry is eligible
   */
  getTimeUntilNextRetry(lead: RetryableLead): number | null {
    if (!lead.lastRetryAt) return 0;

    const retryCount = lead.retryCount ?? 0;
    const delayMs = this.getRetryDelay(retryCount);
    const timeSinceLastRetry = Date.now() - lead.lastRetryAt.getTime();
    const timeRemaining = delayMs - timeSinceLastRetry;

    return timeRemaining > 0 ? timeRemaining : 0;
  }

  /**
   * Log retry attempt
   */
  logRetryAttempt(lead: RetryableLead, error: string): void {
    const retryCount = (lead.retryCount ?? 0) + 1;
    const nextDelay = this.getRetryDelayHuman(retryCount);

    retryLogger.info(
      {
        leadId: lead.leadId,
        retryCount,
        maxRetries: this.maxRetries,
        nextDelay,
        error,
      },
      `Lead retry ${retryCount}/${this.maxRetries}, next retry in ${nextDelay}`,
    );
  }

  /**
   * Log when lead is marked as permanently failed
   */
  logMaxRetriesExceeded(lead: RetryableLead, error: string): void {
    retryLogger.error(
      {
        leadId: lead.leadId,
        retryCount: lead.retryCount,
        maxRetries: this.maxRetries,
        lastError: error,
      },
      `Lead failed after ${this.maxRetries} retries, marking as permanently failed`,
    );
  }
}

// Singleton instance
export const retryService = new RetryService();
