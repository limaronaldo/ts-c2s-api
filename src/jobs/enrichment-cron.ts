/**
 * Enrichment Cron Job
 * RML-619: Scheduled enrichment for pending leads
 *
 * Runs every 15 minutes (configurable) to:
 * - Fetch recent unenriched leads from C2S
 * - Enrich each with rate limiting
 * - Log results for monitoring
 */

import { Cron } from "croner";
import { container } from "../container";
import { logger } from "../utils/logger";
import { C2SService } from "../services/c2s.service";

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
  interval: string; // Cron expression (e.g., "*/15 * * * *")
  batchSize: number; // Number of leads to process per run
  delayMs: number; // Delay between enrichments
}

let cronJob: Cron | null = null;
let isRunning = false;

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
      "Enrichment cycle completed",
    );
  } catch (error) {
    cronLogger.error({ error }, "Enrichment cycle failed");
  } finally {
    isRunning = false;
  }
}

/**
 * Start the enrichment cron job
 */
export function startEnrichmentCron(config: CronJobConfig): Cron | null {
  if (!config.enabled) {
    cronLogger.info("Enrichment cron is disabled");
    return null;
  }

  if (cronJob) {
    cronLogger.warn("Cron job already running, stopping previous instance");
    cronJob.stop();
  }

  cronLogger.info(
    {
      interval: config.interval,
      batchSize: config.batchSize,
      delayMs: config.delayMs,
    },
    "Starting enrichment cron job",
  );

  cronJob = new Cron(config.interval, async () => {
    await runEnrichmentCycle(config);
  });

  return cronJob;
}

/**
 * Stop the enrichment cron job
 */
export function stopEnrichmentCron(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
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
} {
  return {
    running: cronJob !== null && cronJob.isRunning(),
    isProcessing: isRunning,
    nextRun: cronJob?.nextRun() ?? null,
  };
}

/**
 * Trigger a manual run of the enrichment cycle
 */
export async function triggerManualRun(config: CronJobConfig): Promise<void> {
  cronLogger.info("Manual enrichment run triggered");
  await runEnrichmentCycle(config);
}
