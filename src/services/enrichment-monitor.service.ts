/**
 * Enrichment Monitor Service
 *
 * Monitors the enrichment rate and sends alerts when it falls below threshold.
 * Checks the rate periodically and alerts via Slack/email.
 */

import { alertService } from "./alert.service";
import { logger } from "../utils/logger";
import { getConfig } from "../config";

const monitorLogger = logger.child({ module: "enrichment-monitor" });

// Minimum threshold for enrichment rate (80%)
const ENRICHMENT_RATE_THRESHOLD = 80;

// Check interval: every 6 hours
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface EnrichmentStats {
  total: number;
  enriched: number;
  unenriched: number;
  rate: number;
}

export class EnrichmentMonitorService {
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private lastAlertRate: number | null = null;
  private dbUrl: string;

  constructor() {
    const config = getConfig();
    // Use separate DB for batch enrichment stats if provided
    this.dbUrl = config.ENRICHMENT_DB_URL || config.DB_URL;
  }

  /**
   * Start the enrichment rate monitor
   */
  start(): void {
    if (this.checkInterval) {
      monitorLogger.warn("Enrichment monitor already running");
      return;
    }

    monitorLogger.info(
      { threshold: ENRICHMENT_RATE_THRESHOLD, intervalMs: CHECK_INTERVAL_MS },
      "Starting enrichment rate monitor"
    );

    // Run initial check
    this.checkEnrichmentRate();

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.checkEnrichmentRate();
    }, CHECK_INTERVAL_MS);
  }

  /**
   * Stop the enrichment rate monitor
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      monitorLogger.info("Enrichment monitor stopped");
    }
  }

  /**
   * Check the current enrichment rate and alert if below threshold
   */
  async checkEnrichmentRate(): Promise<void> {
    try {
      const stats = await this.getEnrichmentStats();

      monitorLogger.info(
        {
          total: stats.total,
          enriched: stats.enriched,
          unenriched: stats.unenriched,
          rate: stats.rate,
          threshold: ENRICHMENT_RATE_THRESHOLD,
        },
        "Enrichment rate check"
      );

      // Alert if rate is below threshold
      if (stats.rate < ENRICHMENT_RATE_THRESHOLD) {
        // Only alert if rate dropped (avoid repeated alerts for same rate)
        if (this.lastAlertRate === null || stats.rate < this.lastAlertRate) {
          await alertService.alertLowEnrichmentRate({
            currentRate: stats.rate,
            threshold: ENRICHMENT_RATE_THRESHOLD,
            totalLeads: stats.total,
            enrichedLeads: stats.enriched,
            unenrichedLeads: stats.unenriched,
            period: "Batch enrichment (leads-mb)",
          });

          this.lastAlertRate = stats.rate;
          monitorLogger.warn(
            { rate: stats.rate, threshold: ENRICHMENT_RATE_THRESHOLD },
            "Low enrichment rate alert sent"
          );
        }
      } else {
        // Rate is above threshold, reset alert tracking
        if (this.lastAlertRate !== null) {
          monitorLogger.info(
            { rate: stats.rate, previousAlertRate: this.lastAlertRate },
            "Enrichment rate recovered above threshold"
          );
          this.lastAlertRate = null;
        }
      }
    } catch (error) {
      monitorLogger.error({ error }, "Failed to check enrichment rate");
    }
  }

  /**
   * Get enrichment statistics from the database
   */
  private async getEnrichmentStats(): Promise<EnrichmentStats> {
    // Dynamic import to avoid circular dependencies
    const postgres = (await import("postgres")).default;
    const sql = postgres(this.dbUrl);

    try {
      const result = await sql`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN enrichment_status IN ('completed', 'partial') THEN 1 END) as enriched,
          COUNT(CASE WHEN enrichment_status IN ('unenriched', 'pending') THEN 1 END) as unenriched
        FROM c2s.enriched_leads
        WHERE enrichment_status != 'invalid_phone'
      `;

      const total = Number(result[0].total);
      const enriched = Number(result[0].enriched);
      const unenriched = Number(result[0].unenriched);
      const rate = total > 0 ? Math.round((enriched / total) * 1000) / 10 : 0;

      await sql.end();

      return { total, enriched, unenriched, rate };
    } catch (error) {
      await sql.end();
      throw error;
    }
  }

  /**
   * Get current stats without triggering alerts (for dashboard/API)
   */
  async getCurrentStats(): Promise<EnrichmentStats> {
    return this.getEnrichmentStats();
  }
}

// Singleton instance
export const enrichmentMonitor = new EnrichmentMonitorService();
