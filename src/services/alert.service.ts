/**
 * Alert Service (RML-639, RML-795)
 *
 * Sends webhook and email alerts for enrichment failures and service issues.
 * - Rate limiting: max 1 alert per type per 5 minutes
 * - Alert types: lead_max_retries, high_error_rate, service_down
 * - Tracks error rate with sliding window
 * - Tracks service health status
 * - Supports both Slack webhooks and email (Resend)
 */

import { getConfig } from "../config";
import { logger } from "../utils/logger";
import { emailService } from "./email.service";

const alertLogger = logger.child({ module: "alerts" });

export type AlertType = "lead_max_retries" | "high_error_rate" | "service_down" | "high_value_lead";

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
    const severity = this.getSeverity(type);
    const message = this.getMessage(type, details);

    // Slack webhook format
    const slackPayload = {
      text: `${severity === "critical" ? "🚨" : "⚠️"} *${type.toUpperCase().replace(/_/g, " ")}*`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${severity === "critical" ? "🚨" : "⚠️"} ${type.toUpperCase().replace(/_/g, " ")}`,
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: message,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `*App:* ts-c2s-api | *Env:* ${config.NODE_ENV} | *Time:* ${new Date().toISOString()}`,
            },
          ],
        },
      ],
    };

    // Also keep internal payload for logging
    const payload: AlertPayload = {
      type,
      timestamp: new Date().toISOString(),
      severity,
      message,
      details,
      app: "ts-c2s-api",
      environment: config.NODE_ENV,
    };

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slackPayload),
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
      alertLogger.info({ type, details }, "Slack alert sent successfully");

      // Also send email alert for critical alerts (RML-795)
      if (severity === "critical" || type === "lead_max_retries") {
        this.sendEmailAlert(type, severity, message, details);
      }

      return true;
    } catch (error) {
      alertLogger.error({ type, error }, "Failed to send alert");
      return false;
    }
  }

  /**
   * Send email alert (RML-795)
   * Called automatically for critical alerts
   */
  private async sendEmailAlert(
    type: AlertType,
    severity: AlertSeverity,
    message: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await emailService.sendAlert({ type, severity, message, details });
    } catch (error) {
      alertLogger.error({ type, error }, "Failed to send email alert");
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
   * Send alert for high-value lead (RML-810)
   */
  async alertHighValueLead(details: {
    leadId: string;
    name: string;
    phone?: string;
    email?: string;
    income?: number;
    neighborhood?: string;
    companies?: number;
    familyName?: string;
    reasons: string[];
    c2sUrl?: string;
  }): Promise<void> {
    await this.sendAlert("high_value_lead", details);
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
      case "high_value_lead":
        return "critical"; // High priority - notify immediately
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
      case "high_value_lead":
        return this.formatHighValueLeadMessage(details);
      default:
        return `Alert: ${type}`;
    }
  }

  /**
   * Format high-value lead message (RML-810)
   */
  private formatHighValueLeadMessage(details: Record<string, unknown>): string {
    const lines: string[] = [];

    lines.push(`*Nome:* ${details.name}`);

    if (details.income) {
      const incomeFormatted = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(details.income as number);
      lines.push(`*Renda:* ${incomeFormatted}/mês`);
    }

    if (details.neighborhood) {
      lines.push(`*Bairro:* ${details.neighborhood}`);
    }

    if (details.companies && (details.companies as number) > 0) {
      lines.push(`*Empresas:* ${details.companies} ativas`);
    }

    if (details.familyName) {
      lines.push(`*Família:* ${details.familyName}`);
    }

    if (details.phone) {
      lines.push(`*Telefone:* ${details.phone}`);
    }

    if (details.reasons && Array.isArray(details.reasons)) {
      lines.push(`\n*Por que é premium:*`);
      for (const reason of details.reasons as string[]) {
        lines.push(`• ${reason}`);
      }
    }

    return lines.join("\n");
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
