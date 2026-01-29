/**
 * Fly.io Auto-Scale Service
 *
 * Automatically scales Fly.io machines up/down for cost optimization.
 * Used primarily for CPF Lookup API which needs 8GB RAM for searches
 * but can run on 256MB when idle.
 */

import { getConfig } from "../config";

const log = (level: string, msg: string, data?: Record<string, unknown>) => {
  console.log(
    JSON.stringify({
      level,
      module: "fly-scale",
      msg,
      ...data,
      timestamp: new Date().toISOString(),
    }),
  );
};

interface MachineConfig {
  guest: {
    cpu_kind: string;
    cpus: number;
    memory_mb: number;
  };
}

interface ScaleConfig {
  cpu_kind: string;
  cpus: number;
  memory_mb: number;
}

const SCALE_CONFIGS = {
  up: {
    cpu_kind: "performance",
    cpus: 2,
    memory_mb: 8192,
  },
  down: {
    cpu_kind: "shared",
    cpus: 1,
    memory_mb: 256,
  },
} as const;

export class FlyScaleService {
  private readonly apiToken: string | undefined;
  private readonly appName: string;
  private readonly machineId: string | undefined;
  private readonly autoScaleEnabled: boolean;
  private readonly baseUrl = "https://api.machines.dev/v1";

  // Track current state to avoid unnecessary API calls
  private currentScale: "up" | "down" | "unknown" = "unknown";
  private lastScaleTime: Date | null = null;
  private scaleInProgress = false;

  // Auto scale-down timer
  private scaleDownTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly scaleDownDelayMs = 5 * 60 * 1000; // 5 minutes after last use

  constructor() {
    const config = getConfig();
    this.apiToken = config.FLY_API_TOKEN;
    this.appName = config.CPF_LOOKUP_APP_NAME;
    this.machineId = config.CPF_LOOKUP_MACHINE_ID;
    this.autoScaleEnabled = config.CPF_LOOKUP_AUTO_SCALE;

    if (!this.apiToken) {
      log("warn", "FLY_API_TOKEN not set - auto-scaling disabled");
    }
  }

  /**
   * Check if auto-scaling is available
   */
  isEnabled(): boolean {
    return this.autoScaleEnabled && !!this.apiToken;
  }

  /**
   * Get the machine ID (fetches from API if not configured)
   */
  private async getMachineId(): Promise<string | null> {
    if (this.machineId) return this.machineId;

    try {
      const response = await fetch(
        `${this.baseUrl}/apps/${this.appName}/machines`,
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        log("error", "Failed to list machines", { status: response.status });
        return null;
      }

      const machines = (await response.json()) as Array<{ id: string; state: string }>;
      const runningMachine = machines.find((m) => m.state === "started");

      if (runningMachine) {
        log("info", "Found machine", { machineId: runningMachine.id });
        return runningMachine.id;
      }

      // Return first machine if none running
      if (machines.length > 0) {
        return machines[0].id;
      }

      log("warn", "No machines found for app", { appName: this.appName });
      return null;
    } catch (error) {
      log("error", "Failed to get machine ID", { error: String(error) });
      return null;
    }
  }

  /**
   * Get current machine configuration
   */
  async getCurrentConfig(): Promise<MachineConfig | null> {
    if (!this.apiToken) return null;

    const machineId = await this.getMachineId();
    if (!machineId) return null;

    try {
      const response = await fetch(
        `${this.baseUrl}/apps/${this.appName}/machines/${machineId}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        log("error", "Failed to get machine config", { status: response.status });
        return null;
      }

      const machine = (await response.json()) as { config: MachineConfig };
      return machine.config;
    } catch (error) {
      log("error", "Failed to get machine config", { error: String(error) });
      return null;
    }
  }

  /**
   * Scale the machine to specified configuration
   */
  private async scaleTo(config: ScaleConfig): Promise<boolean> {
    if (!this.apiToken) {
      log("warn", "Cannot scale - no API token");
      return false;
    }

    if (this.scaleInProgress) {
      log("info", "Scale already in progress, skipping");
      return true;
    }

    const machineId = await this.getMachineId();
    if (!machineId) {
      log("error", "Cannot scale - no machine ID");
      return false;
    }

    this.scaleInProgress = true;

    try {
      log("info", "Scaling machine", {
        machineId,
        cpu_kind: config.cpu_kind,
        cpus: config.cpus,
        memory_mb: config.memory_mb,
      });

      // Get current machine config first
      const currentResponse = await fetch(
        `${this.baseUrl}/apps/${this.appName}/machines/${machineId}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!currentResponse.ok) {
        log("error", "Failed to get current config", { status: currentResponse.status });
        return false;
      }

      const currentMachine = (await currentResponse.json()) as { config: any };

      // Update the guest config
      const updatedConfig = {
        ...currentMachine.config,
        guest: {
          ...currentMachine.config.guest,
          cpu_kind: config.cpu_kind,
          cpus: config.cpus,
          memory_mb: config.memory_mb,
        },
      };

      // Update machine
      const updateResponse = await fetch(
        `${this.baseUrl}/apps/${this.appName}/machines/${machineId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ config: updatedConfig }),
          signal: AbortSignal.timeout(60000),
        },
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        log("error", "Failed to update machine", {
          status: updateResponse.status,
          error: errorText,
        });
        return false;
      }

      // Wait for machine to be ready
      await this.waitForMachine(machineId);

      this.lastScaleTime = new Date();
      log("info", "Machine scaled successfully", {
        machineId,
        memory_mb: config.memory_mb,
      });

      return true;
    } catch (error) {
      log("error", "Scale failed", { error: String(error) });
      return false;
    } finally {
      this.scaleInProgress = false;
    }
  }

  /**
   * Wait for machine to be in started state
   */
  private async waitForMachine(machineId: string, maxWaitMs = 30000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await fetch(
          `${this.baseUrl}/apps/${this.appName}/machines/${machineId}`,
          {
            headers: {
              Authorization: `Bearer ${this.apiToken}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(5000),
          },
        );

        if (response.ok) {
          const machine = (await response.json()) as { state: string };
          if (machine.state === "started") {
            return true;
          }
        }
      } catch {
        // Ignore errors during wait
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    log("warn", "Timeout waiting for machine to start");
    return false;
  }

  /**
   * Scale up for heavy workload (8GB RAM + performance CPU)
   */
  async scaleUp(): Promise<boolean> {
    if (!this.isEnabled()) {
      log("debug", "Auto-scale disabled, skipping scale up");
      return true;
    }

    // Cancel any pending scale-down
    if (this.scaleDownTimer) {
      clearTimeout(this.scaleDownTimer);
      this.scaleDownTimer = null;
    }

    // Skip if already scaled up
    if (this.currentScale === "up") {
      log("debug", "Already scaled up, skipping");
      return true;
    }

    const success = await this.scaleTo(SCALE_CONFIGS.up);
    if (success) {
      this.currentScale = "up";
    }
    return success;
  }

  /**
   * Scale down for cost savings (256MB RAM + shared CPU)
   */
  async scaleDown(): Promise<boolean> {
    if (!this.isEnabled()) {
      log("debug", "Auto-scale disabled, skipping scale down");
      return true;
    }

    // Skip if already scaled down
    if (this.currentScale === "down") {
      log("debug", "Already scaled down, skipping");
      return true;
    }

    const success = await this.scaleTo(SCALE_CONFIGS.down);
    if (success) {
      this.currentScale = "down";
    }
    return success;
  }

  /**
   * Schedule scale-down after delay (call this after each use)
   */
  scheduleScaleDown(): void {
    if (!this.isEnabled()) return;

    // Clear existing timer
    if (this.scaleDownTimer) {
      clearTimeout(this.scaleDownTimer);
    }

    log("debug", "Scheduling scale-down", { delayMs: this.scaleDownDelayMs });

    this.scaleDownTimer = setTimeout(async () => {
      log("info", "Auto scale-down triggered after idle period");
      await this.scaleDown();
    }, this.scaleDownDelayMs);
  }

  /**
   * Get current scale status
   */
  getStatus(): {
    enabled: boolean;
    currentScale: string;
    lastScaleTime: Date | null;
    scaleInProgress: boolean;
  } {
    return {
      enabled: this.isEnabled(),
      currentScale: this.currentScale,
      lastScaleTime: this.lastScaleTime,
      scaleInProgress: this.scaleInProgress,
    };
  }
}
