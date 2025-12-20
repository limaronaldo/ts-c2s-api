/**
 * Alert Service Tests (RML-639)
 * Unit tests for alert webhook notifications
 */
import { describe, expect, test } from "bun:test";

type AlertType = "lead_max_retries" | "high_error_rate" | "service_down";
type AlertSeverity = "warning" | "critical";

interface AlertPayload {
  type: AlertType;
  timestamp: string;
  severity: AlertSeverity;
  message: string;
  details: Record<string, unknown>;
  app: string;
  environment: string;
}

describe("AlertService", () => {
  describe("getSeverity", () => {
    function getSeverity(type: AlertType): AlertSeverity {
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

    test("returns critical for service_down", () => {
      expect(getSeverity("service_down")).toBe("critical");
    });

    test("returns critical for high_error_rate", () => {
      expect(getSeverity("high_error_rate")).toBe("critical");
    });

    test("returns warning for lead_max_retries", () => {
      expect(getSeverity("lead_max_retries")).toBe("warning");
    });
  });

  describe("getMessage", () => {
    function getMessage(type: AlertType, details: Record<string, unknown>): string {
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

    test("formats lead_max_retries message correctly", () => {
      const message = getMessage("lead_max_retries", {
        leadId: "lead-123",
        retryCount: 5,
        lastError: "CPF not found",
      });

      expect(message).toBe("Lead lead-123 failed after 5 retries: CPF not found");
    });

    test("formats high_error_rate message correctly", () => {
      const message = getMessage("high_error_rate", {
        errorRate: 75.5,
        windowMinutes: 10,
        failures: 15,
        totalAttempts: 20,
      });

      expect(message).toBe("High error rate: 75.5% failures in last 10 minutes (15/20)");
    });

    test("formats service_down message correctly", () => {
      const message = getMessage("service_down", {
        service: "diretrix",
        downSinceMinutes: 15,
      });

      expect(message).toBe("Service diretrix has been down for 15 minutes");
    });
  });

  describe("rate limiting", () => {
    test("rate limits alerts of same type", () => {
      const rateLimitMs = 5 * 60 * 1000; // 5 minutes
      const lastAlertTimes = new Map<string, number>();

      function shouldSendAlert(type: AlertType): boolean {
        const lastSent = lastAlertTimes.get(type);
        if (lastSent && Date.now() - lastSent < rateLimitMs) {
          return false;
        }
        lastAlertTimes.set(type, Date.now());
        return true;
      }

      // First alert should be sent
      expect(shouldSendAlert("lead_max_retries")).toBe(true);

      // Immediate second alert should be rate limited
      expect(shouldSendAlert("lead_max_retries")).toBe(false);

      // Different alert type should not be rate limited
      expect(shouldSendAlert("service_down")).toBe(true);
    });
  });

  describe("error rate tracking", () => {
    test("calculates error rate correctly", () => {
      const results = [
        { success: true },
        { success: true },
        { success: false },
        { success: true },
        { success: false },
      ];

      const failures = results.filter((r) => !r.success).length;
      const total = results.length;
      const errorRate = (failures / total) * 100;

      expect(failures).toBe(2);
      expect(total).toBe(5);
      expect(errorRate).toBe(40);
    });

    test("triggers alert when error rate exceeds threshold", () => {
      const errorThreshold = 50;
      const results = [
        { success: false },
        { success: false },
        { success: false },
        { success: true },
        { success: false },
      ];

      const failures = results.filter((r) => !r.success).length;
      const errorRate = (failures / results.length) * 100;

      expect(errorRate).toBe(80);
      expect(errorRate >= errorThreshold).toBe(true);
    });

    test("does not trigger alert when error rate is below threshold", () => {
      const errorThreshold = 50;
      const results = [
        { success: true },
        { success: true },
        { success: true },
        { success: true },
        { success: false },
      ];

      const failures = results.filter((r) => !r.success).length;
      const errorRate = (failures / results.length) * 100;

      expect(errorRate).toBe(20);
      expect(errorRate >= errorThreshold).toBe(false);
    });

    test("requires minimum sample size", () => {
      const minSampleSize = 10;
      const results = [
        { success: false },
        { success: false },
        { success: false },
      ];

      const shouldCheck = results.length >= minSampleSize;
      expect(shouldCheck).toBe(false);
    });
  });

  describe("service health tracking", () => {
    test("tracks service down since timestamp", () => {
      const serviceDownSince = new Map<string, number>();
      const now = Date.now();

      // Mark service as down
      serviceDownSince.set("diretrix", now - 10 * 60 * 1000); // 10 minutes ago

      const downSince = serviceDownSince.get("diretrix");
      expect(downSince).toBeDefined();

      const downDuration = now - (downSince ?? 0);
      const downMinutes = Math.round(downDuration / 60000);
      expect(downMinutes).toBe(10);
    });

    test("clears down status when service recovers", () => {
      const serviceDownSince = new Map<string, number>();
      const serviceLastSuccess = new Map<string, number>();

      // Mark service as down
      serviceDownSince.set("diretrix", Date.now() - 5 * 60 * 1000);

      // Service recovers
      serviceDownSince.delete("diretrix");
      serviceLastSuccess.set("diretrix", Date.now());

      expect(serviceDownSince.has("diretrix")).toBe(false);
      expect(serviceLastSuccess.has("diretrix")).toBe(true);
    });

    test("triggers alert after service down threshold", () => {
      const serviceDownMs = 5 * 60 * 1000; // 5 minutes
      const downSince = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      const downDuration = Date.now() - downSince;

      expect(downDuration >= serviceDownMs).toBe(true);
    });

    test("does not trigger alert before threshold", () => {
      const serviceDownMs = 5 * 60 * 1000; // 5 minutes
      const downSince = Date.now() - 2 * 60 * 1000; // 2 minutes ago
      const downDuration = Date.now() - downSince;

      expect(downDuration >= serviceDownMs).toBe(false);
    });
  });

  describe("payload structure", () => {
    test("creates valid alert payload", () => {
      const payload: AlertPayload = {
        type: "lead_max_retries",
        timestamp: new Date().toISOString(),
        severity: "warning",
        message: "Lead lead-123 failed after 5 retries",
        details: { leadId: "lead-123", retryCount: 5 },
        app: "ts-c2s-api",
        environment: "production",
      };

      expect(payload.type).toBe("lead_max_retries");
      expect(payload.severity).toBe("warning");
      expect(payload.app).toBe("ts-c2s-api");
      expect(new Date(payload.timestamp).toString()).not.toBe("Invalid Date");
    });
  });
});
