/**
 * Metrics Service for Enrichment Performance Tracking
 * Reference: Lead Operations Guide - observability requirements
 *
 * Tracks:
 * - Total leads processed
 * - CPF discovery rate
 * - Work API success/timeout/failure rates
 * - C2S creation success rate
 * - Average enrichment time
 */

import { enrichmentLogger } from "../utils/logger";

export interface EnrichmentMetrics {
  // Counters
  totalLeadsProcessed: number;
  cpfDiscovered: number;
  cpfNotFound: number;

  // Work API metrics
  workApiSuccess: number;
  workApiTimeout: number;
  workApiFailure: number;
  workApiCacheHits: number;

  // C2S metrics
  c2sCreated: number;
  c2sUpdated: number;
  c2sFailure: number;

  // Enrichment outcomes
  fullyEnriched: number;
  partiallyEnriched: number;
  notEnriched: number;

  // Timing (in milliseconds)
  totalEnrichmentTimeMs: number;
  avgEnrichmentTimeMs: number;
  minEnrichmentTimeMs: number;
  maxEnrichmentTimeMs: number;

  // Session info
  sessionStartTime: Date;
  lastActivityTime: Date;
}

export interface MetricsSnapshot extends EnrichmentMetrics {
  // Calculated rates (percentages)
  cpfDiscoveryRate: number;
  workApiSuccessRate: number;
  workApiTimeoutRate: number;
  c2sSuccessRate: number;
  enrichmentSuccessRate: number;
  cacheHitRate: number;
}

class MetricsService {
  private metrics: EnrichmentMetrics;
  private enrichmentTimes: number[] = [];

  constructor() {
    this.metrics = this.createEmptyMetrics();
  }

  private createEmptyMetrics(): EnrichmentMetrics {
    const now = new Date();
    return {
      totalLeadsProcessed: 0,
      cpfDiscovered: 0,
      cpfNotFound: 0,
      workApiSuccess: 0,
      workApiTimeout: 0,
      workApiFailure: 0,
      workApiCacheHits: 0,
      c2sCreated: 0,
      c2sUpdated: 0,
      c2sFailure: 0,
      fullyEnriched: 0,
      partiallyEnriched: 0,
      notEnriched: 0,
      totalEnrichmentTimeMs: 0,
      avgEnrichmentTimeMs: 0,
      minEnrichmentTimeMs: 0,
      maxEnrichmentTimeMs: 0,
      sessionStartTime: now,
      lastActivityTime: now,
    };
  }

  /**
   * Reset all metrics (e.g., at start of new session)
   */
  reset(): void {
    this.metrics = this.createEmptyMetrics();
    this.enrichmentTimes = [];
    enrichmentLogger.info("Metrics reset");
  }

  /**
   * Record a lead processing attempt
   */
  recordLeadProcessed(): void {
    this.metrics.totalLeadsProcessed++;
    this.metrics.lastActivityTime = new Date();
  }

  /**
   * Record CPF discovery result
   */
  recordCpfDiscovery(found: boolean): void {
    if (found) {
      this.metrics.cpfDiscovered++;
    } else {
      this.metrics.cpfNotFound++;
    }
    this.metrics.lastActivityTime = new Date();
  }

  /**
   * Record Work API result
   */
  recordWorkApiResult(result: "success" | "timeout" | "failure" | "cache_hit"): void {
    switch (result) {
      case "success":
        this.metrics.workApiSuccess++;
        break;
      case "timeout":
        this.metrics.workApiTimeout++;
        break;
      case "failure":
        this.metrics.workApiFailure++;
        break;
      case "cache_hit":
        this.metrics.workApiCacheHits++;
        break;
    }
    this.metrics.lastActivityTime = new Date();
  }

  /**
   * Record C2S operation result
   */
  recordC2sResult(result: "created" | "updated" | "failure"): void {
    switch (result) {
      case "created":
        this.metrics.c2sCreated++;
        break;
      case "updated":
        this.metrics.c2sUpdated++;
        break;
      case "failure":
        this.metrics.c2sFailure++;
        break;
    }
    this.metrics.lastActivityTime = new Date();
  }

  /**
   * Record enrichment outcome
   */
  recordEnrichmentOutcome(outcome: "full" | "partial" | "none"): void {
    switch (outcome) {
      case "full":
        this.metrics.fullyEnriched++;
        break;
      case "partial":
        this.metrics.partiallyEnriched++;
        break;
      case "none":
        this.metrics.notEnriched++;
        break;
    }
    this.metrics.lastActivityTime = new Date();
  }

  /**
   * Record enrichment duration
   */
  recordEnrichmentTime(durationMs: number): void {
    this.enrichmentTimes.push(durationMs);
    this.metrics.totalEnrichmentTimeMs += durationMs;

    // Update min/max
    if (this.enrichmentTimes.length === 1) {
      this.metrics.minEnrichmentTimeMs = durationMs;
      this.metrics.maxEnrichmentTimeMs = durationMs;
    } else {
      this.metrics.minEnrichmentTimeMs = Math.min(this.metrics.minEnrichmentTimeMs, durationMs);
      this.metrics.maxEnrichmentTimeMs = Math.max(this.metrics.maxEnrichmentTimeMs, durationMs);
    }

    // Update average
    this.metrics.avgEnrichmentTimeMs = this.metrics.totalEnrichmentTimeMs / this.enrichmentTimes.length;
    this.metrics.lastActivityTime = new Date();
  }

  /**
   * Get current metrics snapshot with calculated rates
   */
  getSnapshot(): MetricsSnapshot {
    const total = this.metrics.totalLeadsProcessed;
    const workApiTotal = this.metrics.workApiSuccess + this.metrics.workApiTimeout + this.metrics.workApiFailure;
    const workApiWithCache = workApiTotal + this.metrics.workApiCacheHits;
    const c2sTotal = this.metrics.c2sCreated + this.metrics.c2sUpdated + this.metrics.c2sFailure;
    const enrichmentTotal = this.metrics.fullyEnriched + this.metrics.partiallyEnriched + this.metrics.notEnriched;

    return {
      ...this.metrics,
      cpfDiscoveryRate: total > 0 ? (this.metrics.cpfDiscovered / total) * 100 : 0,
      workApiSuccessRate: workApiTotal > 0 ? (this.metrics.workApiSuccess / workApiTotal) * 100 : 0,
      workApiTimeoutRate: workApiTotal > 0 ? (this.metrics.workApiTimeout / workApiTotal) * 100 : 0,
      c2sSuccessRate: c2sTotal > 0 ? ((this.metrics.c2sCreated + this.metrics.c2sUpdated) / c2sTotal) * 100 : 0,
      enrichmentSuccessRate: enrichmentTotal > 0 ? (this.metrics.fullyEnriched / enrichmentTotal) * 100 : 0,
      cacheHitRate: workApiWithCache > 0 ? (this.metrics.workApiCacheHits / workApiWithCache) * 100 : 0,
    };
  }

  /**
   * Get a formatted summary for logging
   */
  getSummary(): string {
    const snapshot = this.getSnapshot();
    const sessionDuration = (snapshot.lastActivityTime.getTime() - snapshot.sessionStartTime.getTime()) / 1000;

    return [
      "=== Enrichment Session Metrics ===",
      `Session Duration: ${sessionDuration.toFixed(1)}s`,
      "",
      "--- Lead Processing ---",
      `Total Processed: ${snapshot.totalLeadsProcessed}`,
      `CPF Discovery Rate: ${snapshot.cpfDiscoveryRate.toFixed(1)}% (${snapshot.cpfDiscovered}/${snapshot.cpfDiscovered + snapshot.cpfNotFound})`,
      "",
      "--- Work API ---",
      `Success Rate: ${snapshot.workApiSuccessRate.toFixed(1)}%`,
      `Timeout Rate: ${snapshot.workApiTimeoutRate.toFixed(1)}%`,
      `Cache Hit Rate: ${snapshot.cacheHitRate.toFixed(1)}%`,
      `Success: ${snapshot.workApiSuccess} | Timeout: ${snapshot.workApiTimeout} | Failure: ${snapshot.workApiFailure} | Cache: ${snapshot.workApiCacheHits}`,
      "",
      "--- C2S Operations ---",
      `Success Rate: ${snapshot.c2sSuccessRate.toFixed(1)}%`,
      `Created: ${snapshot.c2sCreated} | Updated: ${snapshot.c2sUpdated} | Failed: ${snapshot.c2sFailure}`,
      "",
      "--- Enrichment Outcomes ---",
      `Full Enrichment Rate: ${snapshot.enrichmentSuccessRate.toFixed(1)}%`,
      `Full: ${snapshot.fullyEnriched} | Partial: ${snapshot.partiallyEnriched} | None: ${snapshot.notEnriched}`,
      "",
      "--- Timing ---",
      `Avg: ${snapshot.avgEnrichmentTimeMs.toFixed(0)}ms | Min: ${snapshot.minEnrichmentTimeMs.toFixed(0)}ms | Max: ${snapshot.maxEnrichmentTimeMs.toFixed(0)}ms`,
      "=================================",
    ].join("\n");
  }

  /**
   * Log current metrics summary
   */
  logSummary(): void {
    const snapshot = this.getSnapshot();
    enrichmentLogger.info(
      {
        totalProcessed: snapshot.totalLeadsProcessed,
        cpfDiscoveryRate: `${snapshot.cpfDiscoveryRate.toFixed(1)}%`,
        workApiSuccessRate: `${snapshot.workApiSuccessRate.toFixed(1)}%`,
        workApiTimeoutRate: `${snapshot.workApiTimeoutRate.toFixed(1)}%`,
        c2sSuccessRate: `${snapshot.c2sSuccessRate.toFixed(1)}%`,
        enrichmentSuccessRate: `${snapshot.enrichmentSuccessRate.toFixed(1)}%`,
        avgEnrichmentTimeMs: snapshot.avgEnrichmentTimeMs.toFixed(0),
      },
      "Enrichment session metrics summary"
    );
  }
}

// Singleton instance
export const metricsService = new MetricsService();

/**
 * Helper to time an async operation and record metrics
 */
export async function withMetrics<T>(
  operation: () => Promise<T>,
  onComplete?: (result: T, durationMs: number) => void
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await operation();
    const durationMs = Date.now() - startTime;
    if (onComplete) {
      onComplete(result, durationMs);
    }
    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    metricsService.recordEnrichmentTime(durationMs);
    throw error;
  }
}
