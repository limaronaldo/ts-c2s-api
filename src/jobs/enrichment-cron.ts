/**
 * Enrichment Cron Job
 * RML-619: Scheduled enrichment for pending leads
 * RML-639: Added retry logic for failed leads
 * RML-809: Smart scheduling based on time of day
 *
 * Smart Schedule (America/Sao_Paulo timezone):
 * - 09:00-19:00: Every 5 minutes (business hours)
 * - 19:00-23:30: Every 20 minutes (evening)
 * - 23:30-06:00: Every 60 minutes (night)
 * - 06:00-09:00: Every 20 minutes (early morning)
 *
 * Features:
 * - Fetch recent unenriched leads from C2S
 * - Retry failed leads with exponential backoff
 * - Enrich each with rate limiting
 * - Log results for monitoring
 */

import { container } from "../container";
import { logger } from "../utils/logger";
import { C2SService } from "../services/c2s.service";
import { getConfig } from "../config";
import { alertService } from "../services/alert.service";

const cronLogger = logger.child({ module: "enrichment-cron" });

// Check if lead was already enriched in our database
async function isLeadEnriched(leadId: string): Promise<boolean> {
  const existingLead = await container.dbStorage.findLeadByLeadId(leadId);
  if (!existingLead) return false;
  // Consider these statuses as "already processed"
  const processedStatuses = ["completed", "partial", "unenriched", "basic"];
  return processedStatuses.includes(existingLead.enrichmentStatus ?? "");
}

// Helper for delay between operations
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface CronJobConfig {
  enabled: boolean;
  interval: string; // Cron expression (legacy, now uses smart scheduling)
  batchSize: number; // Number of leads to process per run
  delayMs: number; // Delay between enrichments
}

// Smart interval settings (RML-809)
const SMART_INTERVALS = {
  businessHours: 5 * 60 * 1000,   // 5 minutes (09:00-19:00)
  evening: 20 * 60 * 1000,        // 20 minutes (19:00-23:30)
  night: 60 * 60 * 1000,          // 60 minutes (23:30-06:00)
  earlyMorning: 20 * 60 * 1000,   // 20 minutes (06:00-09:00)
};

let smartCronTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let isStopped = false;

/**
 * Get the current interval based on São Paulo time (RML-809)
 */
function getSmartInterval(): { intervalMs: number; period: string } {
  // Get current time in São Paulo
  const now = new Date();
  const spTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const hours = spTime.getHours();
  const minutes = spTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // 09:00-19:00 (540-1140 minutes): Business hours - 5 min
  if (timeInMinutes >= 540 && timeInMinutes < 1140) {
    return { intervalMs: SMART_INTERVALS.businessHours, period: "business" };
  }

  // 19:00-23:30 (1140-1410 minutes): Evening - 20 min
  if (timeInMinutes >= 1140 && timeInMinutes < 1410) {
    return { intervalMs: SMART_INTERVALS.evening, period: "evening" };
  }

  // 23:30-06:00 (1410-1440 or 0-360 minutes): Night - 60 min
  if (timeInMinutes >= 1410 || timeInMinutes < 360) {
    return { intervalMs: SMART_INTERVALS.night, period: "night" };
  }

  // 06:00-09:00 (360-540 minutes): Early morning - 20 min
  return { intervalMs: SMART_INTERVALS.earlyMorning, period: "early_morning" };
}

// Retry delays in milliseconds (exponential backoff)
const RETRY_DELAYS_MS = [
  1 * 60 * 60 * 1000, // 1 hour
  2 * 60 * 60 * 1000, // 2 hours
  4 * 60 * 60 * 1000, // 4 hours
  8 * 60 * 60 * 1000, // 8 hours
  16 * 60 * 60 * 1000, // 16 hours
];

/**
 * Process retry-eligible leads (RML-639)
 */
async function processRetries(config: CronJobConfig): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  maxRetriesReached: number;
}> {
  const appConfig = getConfig();
  const maxRetries = appConfig.RETRY_MAX_ATTEMPTS;

  if (!appConfig.RETRY_ENABLED) {
    return { processed: 0, succeeded: 0, failed: 0, maxRetriesReached: 0 };
  }

  // Get leads eligible for retry
  const retryableLeads = await container.dbStorage.getRetryableLeads(
    maxRetries,
    RETRY_DELAYS_MS,
  );

  if (retryableLeads.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, maxRetriesReached: 0 };
  }

  cronLogger.info(
    { count: retryableLeads.length },
    "Found leads eligible for retry",
  );

  let succeeded = 0;
  let failed = 0;
  let maxRetriesReached = 0;

  for (const lead of retryableLeads) {
    try {
      const result = await container.enrichment.enrichLead({
        leadId: lead.leadId,
        name: lead.name || "Unknown",
        phone: lead.phone ?? undefined,
        email: lead.email ?? undefined,
        source: "retry",
      });

      if (result.enriched) {
        succeeded++;
        cronLogger.info(
          { leadId: lead.leadId, retryCount: lead.retryCount },
          "Retry succeeded",
        );
        // Record success for alert service
        alertService.recordEnrichmentResult(true);
      } else {
        // Enrichment didn't fail but also didn't succeed (e.g., no CPF found)
        const retryCount = (lead.retryCount ?? 0) + 1;

        if (retryCount >= maxRetries) {
          // Max retries reached - mark as permanently failed
          await container.dbStorage.markLeadFailed(
            lead.leadId,
            result.message || "Max retries reached",
          );
          maxRetriesReached++;

          // Send alert
          await alertService.alertLeadMaxRetries(
            lead.leadId,
            retryCount,
            result.message || "No CPF found after max retries",
            lead.name ?? undefined,
            lead.phone ?? undefined,
          );

          cronLogger.warn(
            { leadId: lead.leadId, retryCount },
            "Lead failed after max retries",
          );
        } else {
          // Increment retry count
          await container.dbStorage.incrementRetryCount(
            lead.leadId,
            result.message || "Enrichment unsuccessful",
          );
          failed++;
        }

        alertService.recordEnrichmentResult(false);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const retryCount = (lead.retryCount ?? 0) + 1;

      if (retryCount >= maxRetries) {
        await container.dbStorage.markLeadFailed(lead.leadId, errorMessage);
        maxRetriesReached++;

        await alertService.alertLeadMaxRetries(
          lead.leadId,
          retryCount,
          errorMessage,
          lead.name ?? undefined,
          lead.phone ?? undefined,
        );
      } else {
        await container.dbStorage.incrementRetryCount(
          lead.leadId,
          errorMessage,
        );
        failed++;
      }

      alertService.recordEnrichmentResult(false);
      cronLogger.error({ leadId: lead.leadId, error }, "Retry failed");
    }

    // Rate limiting
    await sleep(config.delayMs);
  }

  return {
    processed: retryableLeads.length,
    succeeded,
    failed,
    maxRetriesReached,
  };
}

/**
 * Run a single enrichment cycle
 */
async function runEnrichmentCycle(config: CronJobConfig): Promise<void> {
  if (isRunning) {
    cronLogger.warn("Previous enrichment cycle still running, skipping");
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    cronLogger.info(
      { batchSize: config.batchSize },
      "Starting enrichment cycle",
    );

    // Fetch recent leads from C2S
    const leadsResponse = await container.c2s.getLeads({
      perpage: Math.min(config.batchSize, 50),
      sort: "-created_at",
    });

    const leads = leadsResponse.data;

    // Filter leads that haven't been enriched yet (check our database)
    const enrichmentChecks = await Promise.all(
      leads.map(async (lead) => ({
        lead,
        alreadyEnriched: await isLeadEnriched(lead.id),
      })),
    );
    const unenrichedLeads = enrichmentChecks
      .filter((check) => !check.alreadyEnriched)
      .map((check) => check.lead);

    cronLogger.info(
      {
        fetched: leads.length,
        unenriched: unenrichedLeads.length,
        skipped: leads.length - unenrichedLeads.length,
      },
      "Filtered leads for enrichment (checked database)",
    );

    if (unenrichedLeads.length === 0) {
      cronLogger.info("No unenriched leads found");
      return;
    }

    let enrichedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < unenrichedLeads.length; i++) {
      const lead = unenrichedLeads[i];

      try {
        // Extract phone/email from nested attributes.customer structure
        const phone = C2SService.extractPhone(lead);
        const email = C2SService.extractEmail(lead);
        const customerName = C2SService.extractCustomerName(lead);

        const result = await container.enrichment.enrichLead({
          leadId: lead.id,
          name: customerName,
          phone,
          email,
          source: lead.source,
          campaignName: lead.product,
        });

        if (result.enriched) {
          enrichedCount++;
          cronLogger.debug(
            { leadId: lead.id, cpf: result.cpf },
            "Lead enriched",
          );
        }
      } catch (error) {
        failedCount++;
        cronLogger.error({ leadId: lead.id, error }, "Failed to enrich lead");
      }

      // Rate limiting (except for last one)
      if (i < unenrichedLeads.length - 1) {
        await sleep(config.delayMs);
      }
    }

    const elapsed = Date.now() - startTime;
    cronLogger.info(
      {
        processed: unenrichedLeads.length,
        enriched: enrichedCount,
        failed: failedCount,
        elapsedMs: elapsed,
      },
      "New leads enrichment completed",
    );

    // Process retries (RML-639)
    const retryResults = await processRetries(config);
    if (retryResults.processed > 0) {
      cronLogger.info(
        {
          retryProcessed: retryResults.processed,
          retrySucceeded: retryResults.succeeded,
          retryFailed: retryResults.failed,
          maxRetriesReached: retryResults.maxRetriesReached,
        },
        "Retry processing completed",
      );
    }

    const totalElapsed = Date.now() - startTime;
    cronLogger.info(
      {
        newLeads: unenrichedLeads.length,
        newEnriched: enrichedCount,
        newFailed: failedCount,
        retries: retryResults.processed,
        retrySucceeded: retryResults.succeeded,
        totalElapsedMs: totalElapsed,
      },
      "Enrichment cycle completed",
    );
  } catch (error) {
    cronLogger.error({ error }, "Enrichment cycle failed");
  } finally {
    isRunning = false;
  }
}

/**
 * Schedule next run with smart interval (RML-809)
 */
function scheduleNextRun(config: CronJobConfig): void {
  if (isStopped) return;

  const { intervalMs, period } = getSmartInterval();
  const nextRunTime = new Date(Date.now() + intervalMs);

  cronLogger.info(
    {
      period,
      intervalMinutes: intervalMs / 60000,
      nextRun: nextRunTime.toISOString(),
    },
    "Scheduling next enrichment run",
  );

  smartCronTimer = setTimeout(async () => {
    await runEnrichmentCycle(config);
    scheduleNextRun(config); // Schedule next run after completion
  }, intervalMs);
}

/**
 * Start the enrichment cron job with smart scheduling (RML-809)
 */
export function startEnrichmentCron(config: CronJobConfig): void {
  if (!config.enabled) {
    cronLogger.info("Enrichment cron is disabled");
    return;
  }

  if (smartCronTimer) {
    cronLogger.warn("Cron job already running, stopping previous instance");
    clearTimeout(smartCronTimer);
  }

  isStopped = false;
  const { intervalMs, period } = getSmartInterval();

  cronLogger.info(
    {
      batchSize: config.batchSize,
      delayMs: config.delayMs,
      currentPeriod: period,
      currentIntervalMinutes: intervalMs / 60000,
      schedule: {
        business: "09:00-19:00 → 5min",
        evening: "19:00-23:30 → 20min",
        night: "23:30-06:00 → 60min",
        earlyMorning: "06:00-09:00 → 20min",
      },
    },
    "Starting enrichment cron with smart scheduling",
  );

  // Run immediately on start, then schedule next
  runEnrichmentCycle(config).then(() => {
    scheduleNextRun(config);
  });
}

/**
 * Stop the enrichment cron job
 */
export function stopEnrichmentCron(): void {
  isStopped = true;
  if (smartCronTimer) {
    clearTimeout(smartCronTimer);
    smartCronTimer = null;
    cronLogger.info("Enrichment cron job stopped");
  }
}

/**
 * Get cron job status
 */
export function getCronStatus(): {
  running: boolean;
  isProcessing: boolean;
  nextRun: Date | null;
  currentPeriod: string;
  currentIntervalMinutes: number;
} {
  const { intervalMs, period } = getSmartInterval();
  const nextRunTime = smartCronTimer ? new Date(Date.now() + intervalMs) : null;

  return {
    running: smartCronTimer !== null && !isStopped,
    isProcessing: isRunning,
    nextRun: nextRunTime,
    currentPeriod: period,
    currentIntervalMinutes: intervalMs / 60000,
  };
}

/**
 * Trigger a manual run of the enrichment cycle
 */
export async function triggerManualRun(config: CronJobConfig): Promise<void> {
  cronLogger.info("Manual enrichment run triggered");
  await runEnrichmentCycle(config);
}
