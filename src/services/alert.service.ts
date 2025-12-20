/**
 * Alert Service (RML-639)
 *
 * Sends webhook alerts for enrichment failures and service issues.
 * - Rate limiting: max 1 alert per type per 5 minutes
 * - Alert types: lead_max_retries, high_error_rate, service_down
 * - Tracks error rate with sliding window
 * - Tracks service health status
 */

import { getConfig } from "../config";
import { logger } from "../utils/logger";

const alertLogger = logger.child({ module: "alerts" });

export type AlertType = "lead_max_retries" | "high_error_rate" | "service_down";

export type AlertSeverity = "warning" | "critical";

export interface AlertPayload {
  type: AlertType;
  timestamp: string;
  severity: AlertSeverity;
  message: string;
  details: Record<string, unknown>;
  app: string;
  environment: string;
}

interface ErrorRecord {
  timestamp: number;
  success: boolean;
}

export class AlertService {
  private readonly webhookUrl: string | undefined;
  private readonly rateLimitMs: number;
  private readonly errorThreshold: number;
  private readonly errorWindowMs: number;
  private readonly serviceDownMs: number;

  // Rate limiting
  private lastAlertTimes: Map<string, number> = new Map();

  // Error rate tracking
  private recentResults: ErrorRecord[] = [];

  // Service health tracking
  private serviceDownSince: Map<string, number> = new Map();
  private serviceLastSuccess: Map<string, number> = new Map();

  constructor() {
    const config = getConfig();
    this.webhookUrl = config.ALERT_WEBHOOK_URL;
    this.rateLimitMs = config.ALERT_RATE_LIMIT_MINUTES * 60 * 1000;
    this.errorThreshold = config.ALERT_ERROR_THRESHOLD;
    this.errorWindowMs = config.ALERT_ERROR_WINDOW_MINUTES * 60 * 1000;
    this.serviceDownMs = config.ALERT_SERVICE_DOWN_MINUTES * 60 * 1000;

    if (this.webhookUrl) {
      alertLogger.info(
        { webhookUrl: this.webhookUrl.substring(0, 50) + "..." },
        "Alert service initialized with webhook",
      );
    } else {
      alertLogger.info("Alert service initialized without webhook (alerts disabled)");
    }
  }

  /**
   * Send an alert via webhook
   */
  async sendAlert(
    type: AlertType,
    details: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.webhookUrl) {
      alertLogger.debug({ type }, "Alert skipped - no webhook configured");
      return false;
    }

    // Rate limiting
    const lastSent = this.lastAlertTimes.get(type);
    if (lastSent && Date.now() - lastSent < this.rateLimitMs) {
      alertLogger.debug(
        { type, rateLimitMs: this.rateLimitMs },
        "Alert rate limited",
      );
      return false;
    }

    const config = getConfig();
    const payload: AlertPayload = {
      type,
      timestamp: new Date().toISOString(),
      severity: this.getSeverity(type),
      message: this.getMessage(type, details),
      details,
      app: "ts-c2s-api",
      environment: config.NODE_ENV,
    };

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        alertLogger.error(
          { type, status: response.status },
          "Alert webhook returned error",
        );
        return false;
      }

      this.lastAlertTimes.set(type, Date.now());
      alertLogger.info({ type, details }, "Alert sent successfully");
      return true;
    } catch (error) {
      alertLogger.error({ type, error }, "Failed to send alert");
      return false;
    }
  }

  /**
   * Record enrichment result for error rate tracking
   */
  recordEnrichmentResult(success: boolean): void {
    const now = Date.now();
    this.recentResults.push({ timestamp: now, success });

    // Clean old records outside the window
    const cutoff = now - this.errorWindowMs;
    this.recentResults = this.recentResults.filter((r) => r.timestamp > cutoff);

    // Check error rate
    this.checkErrorRate();
  }

  /**
   * Record service status for down detection
   */
  recordServiceStatus(service: string, isUp: boolean): void {
    const now = Date.now();

    if (isUp) {
      // Service is up - clear down tracking
      this.serviceDownSince.delete(service);
      this.serviceLastSuccess.set(service, now);
    } else {
      // Service is down
      if (!this.serviceDownSince.has(service)) {
        this.serviceDownSince.set(service, now);
      }

      const downSince = this.serviceDownSince.get(service)!;
      const downDuration = now - downSince;

      if (downDuration >= this.serviceDownMs) {
        this.sendAlert("service_down", {
          service,
          downSinceMs: downDuration,
          downSinceMinutes: Math.round(downDuration / 60000),
          lastSuccess: this.serviceLastSuccess.get(service)
            ? new Date(this.serviceLastSuccess.get(service)!).toISOString()
            : null,
        });
      }
    }
  }

  /**
   * Send alert when lead fails after max retries
   */
  async alertLeadMaxRetries(
    leadId: string,
    retryCount: number,
    lastError: string,
    leadName?: string,
    phone?: string,
  ): Promise<void> {
    await this.sendAlert("lead_max_retries", {
      leadId,
      leadName,
      phone,
      retryCount,
      lastError,
    });
  }

  /**
   * Check if error rate exceeds threshold
   */
  private checkErrorRate(): void {
    if (this.recentResults.length < 10) {
      return; // Need minimum sample size
    }

    const failures = this.recentResults.filter((r) => !r.success).length;
    const errorRate = (failures / this.recentResults.length) * 100;

    if (errorRate >= this.errorThreshold) {
      this.sendAlert("high_error_rate", {
        errorRate: Math.round(errorRate * 10) / 10,
        totalAttempts: this.recentResults.length,
        failures,
        windowMinutes: Math.round(this.errorWindowMs / 60000),
        threshold: this.errorThreshold,
      });
    }
  }

  /**
   * Get severity based on alert type
   */
  private getSeverity(type: AlertType): AlertSeverity {
    switch (type) {
      case "service_down":
        return "critical";
      case "high_error_rate":
        return "critical";
      case "lead_max_retries":
        return "warning";
      default:
        return "warning";
    }
  }

  /**
   * Get human-readable message for alert
   */
  private getMessage(type: AlertType, details: Record<string, unknown>): string {
    switch (type) {
      case "lead_max_retries":
        return `Lead ${details.leadId} failed after ${details.retryCount} retries: ${details.lastError}`;
      case "high_error_rate":
        return `High error rate: ${details.errorRate}% failures in last ${details.windowMinutes} minutes (${details.failures}/${details.totalAttempts})`;
      case "service_down":
        return `Service ${details.service} has been down for ${details.downSinceMinutes} minutes`;
      default:
        return `Alert: ${type}`;
    }
  }

  /**
   * Get current error rate stats
   */
  getErrorRateStats(): {
    errorRate: number;
    totalAttempts: number;
    failures: number;
    successes: number;
  } {
    const failures = this.recentResults.filter((r) => !r.success).length;
    const successes = this.recentResults.filter((r) => r.success).length;
    const total = this.recentResults.length;

    return {
      errorRate: total > 0 ? Math.round((failures / total) * 1000) / 10 : 0,
      totalAttempts: total,
      failures,
      successes,
    };
  }

  /**
   * Get service health status
   */
  getServiceHealth(): Record<string, { isUp: boolean; downSinceMinutes?: number }> {
    const now = Date.now();
    const services = ["diretrix", "work_api", "dbase", "c2s"];
    const health: Record<string, { isUp: boolean; downSinceMinutes?: number }> = {};

    for (const service of services) {
      const downSince = this.serviceDownSince.get(service);
      if (downSince) {
        health[service] = {
          isUp: false,
          downSinceMinutes: Math.round((now - downSince) / 60000),
        };
      } else {
        health[service] = { isUp: true };
      }
    }

    return health;
  }
}

// Singleton instance
export const alertService = new AlertService();
