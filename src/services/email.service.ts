/**
 * Email Service (RML-795)
 *
 * Sends email alerts using Resend API.
 * Complements Slack webhooks for critical alerts.
 */

import { Resend } from "resend";
import { getConfig } from "../config";
import { logger } from "../utils/logger";
import type { AlertType, AlertSeverity } from "./alert.service";

const emailLogger = logger.child({ module: "email" });

export interface EmailAlertOptions {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  details: Record<string, unknown>;
}

export class EmailService {
  private resend: Resend | null = null;
  private readonly fromAddress: string;
  private readonly toAddresses: string[];
  private readonly enabled: boolean;

  constructor() {
    const config = getConfig();
    this.enabled = config.ALERT_EMAIL_ENABLED;
    this.fromAddress = config.ALERT_EMAIL_FROM;
    this.toAddresses = config.ALERT_EMAIL_TO
      ? config.ALERT_EMAIL_TO.split(",").map((e) => e.trim())
      : [];

    if (this.enabled && config.RESEND_API_KEY) {
      this.resend = new Resend(config.RESEND_API_KEY);
      emailLogger.info(
        { to: this.toAddresses, from: this.fromAddress },
        "Email alerts enabled",
      );
    } else if (this.enabled) {
      emailLogger.warn("Email alerts enabled but RESEND_API_KEY not set");
      this.enabled = false;
    } else {
      emailLogger.info("Email alerts disabled");
    }
  }

  /**
   * Check if email alerts are enabled and configured
   */
  isEnabled(): boolean {
    return this.enabled && this.resend !== null && this.toAddresses.length > 0;
  }

  /**
   * Send an alert email
   */
  async sendAlert(options: EmailAlertOptions): Promise<boolean> {
    if (!this.isEnabled()) {
      emailLogger.debug({ type: options.type }, "Email alert skipped - not enabled");
      return false;
    }

    const { type, severity, message, details } = options;
    const config = getConfig();

    const subject = this.getSubject(type, severity);
    const html = this.buildHtmlEmail(type, severity, message, details, config.NODE_ENV);

    try {
      const result = await this.resend!.emails.send({
        from: this.fromAddress,
        to: this.toAddresses,
        subject,
        html,
      });

      if (result.error) {
        emailLogger.error(
          { type, error: result.error },
          "Failed to send email alert",
        );
        return false;
      }

      emailLogger.info(
        { type, to: this.toAddresses, id: result.data?.id },
        "Email alert sent successfully",
      );
      return true;
    } catch (error) {
      emailLogger.error({ type, error }, "Email send threw exception");
      return false;
    }
  }

  /**
   * Get email subject based on alert type and severity
   */
  private getSubject(type: AlertType, severity: AlertSeverity): string {
    const emoji = severity === "critical" ? "🚨" : "⚠️";
    const typeLabel = type.replace(/_/g, " ").toUpperCase();
    return `${emoji} [ts-c2s-api] ${typeLabel}`;
  }

  /**
   * Build HTML email content
   */
  private buildHtmlEmail(
    type: AlertType,
    severity: AlertSeverity,
    message: string,
    details: Record<string, unknown>,
    environment: string,
  ): string {
    const severityColor = severity === "critical" ? "#dc2626" : "#f59e0b";
    const severityBg = severity === "critical" ? "#fef2f2" : "#fffbeb";

    const detailsHtml = Object.entries(details)
      .map(
        ([key, value]) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 500; color: #374151;">${key}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">${String(value)}</td>
        </tr>
      `,
      )
      .join("");

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: ${severityColor}; padding: 20px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">
        ${severity === "critical" ? "🚨" : "⚠️"} ${type.replace(/_/g, " ").toUpperCase()}
      </h1>
    </div>

    <!-- Message -->
    <div style="padding: 20px; background: ${severityBg}; border-bottom: 1px solid #e5e7eb;">
      <p style="margin: 0; font-size: 16px; color: #374151; line-height: 1.5;">
        ${message}
      </p>
    </div>

    <!-- Details -->
    <div style="padding: 20px;">
      <h2 style="margin: 0 0 16px; font-size: 16px; color: #111827;">Details</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        ${detailsHtml}
      </table>
    </div>

    <!-- Footer -->
    <div style="padding: 16px 20px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center;">
        App: <strong>ts-c2s-api</strong> |
        Environment: <strong>${environment}</strong> |
        Time: <strong>${new Date().toISOString()}</strong>
      </p>
    </div>

  </div>

  <!-- Dashboard Link -->
  <div style="text-align: center; margin-top: 20px;">
    <a href="https://ts-c2s-api.fly.dev/dashboard"
       style="display: inline-block; padding: 10px 20px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-size: 14px;">
      View Dashboard
    </a>
  </div>
</body>
</html>
    `.trim();
  }
}

// Singleton instance
export const emailService = new EmailService();
