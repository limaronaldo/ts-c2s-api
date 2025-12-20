/**
 * Metrics API Routes
 * Exposes enrichment performance metrics and cron job status
 */

import { Elysia, t } from "elysia";
import { metricsService } from "../services/metrics.service";
import { getCronStatus, triggerManualRun } from "../jobs/enrichment-cron";
import { getConfig } from "../config";
import { container } from "../container";

export const metricsRoute = new Elysia({ prefix: "/metrics" })
  /**
   * GET /metrics
   * Get current metrics snapshot as JSON
   */
  .get("/", async () => {
    const snapshot = metricsService.getSnapshot();
    return {
      success: true,
      data: snapshot,
    };
  })

  /**
   * GET /metrics/summary
   * Get human-readable metrics summary
   */
  .get("/summary", async () => {
    const summary = metricsService.getSummary();
    return new Response(summary, {
      headers: { "Content-Type": "text/plain" },
    });
  })

  /**
   * POST /metrics/reset
   * Reset all metrics (start new session)
   */
  .post("/reset", async () => {
    metricsService.reset();
    return {
      success: true,
      message: "Metrics reset successfully",
    };
  })

  /**
   * GET /metrics/prometheus
   * Get metrics in Prometheus format
   */
  /**
   * GET /metrics/cron
   * Get cron job status (RML-619)
   */
  .get("/cron", async () => {
    const status = getCronStatus();
    const config = getConfig();

    return {
      success: true,
      data: {
        enabled: config.ENABLE_CRON,
        running: status.running,
        isProcessing: status.isProcessing,
        nextRun: status.nextRun?.toISOString() ?? null,
        config: {
          interval: config.CRON_INTERVAL,
          batchSize: config.CRON_BATCH_SIZE,
          delayMs: config.CRON_DELAY_MS,
        },
      },
    };
  })

  /**
   * POST /metrics/cron/trigger
   * Manually trigger an enrichment cycle (RML-619)
   */
  .post("/cron/trigger", async () => {
    const config = getConfig();

    // Run in background, don't wait
    triggerManualRun({
      enabled: true,
      interval: config.CRON_INTERVAL,
      batchSize: config.CRON_BATCH_SIZE,
      delayMs: config.CRON_DELAY_MS,
    });

    return {
      success: true,
      message: "Enrichment cycle triggered",
    };
  })

  /**
   * GET /metrics/prometheus
   * Get metrics in Prometheus format
   */
  /**
   * POST /metrics/debug/mimir
   * Test Mimir service directly
   */
  .post(
    "/debug/mimir",
    async ({ body }) => {
      const { phone, email } = body;
      const results: Record<string, unknown> = {};

      if (phone) {
        try {
          const phoneResult = await container.mimir.findCpfByPhone(phone);
          results.phoneResult = phoneResult;
        } catch (error) {
          results.phoneError =
            error instanceof Error ? error.message : "Unknown error";
        }
      }

      if (email) {
        try {
          const emailResult = await container.mimir.findCpfByEmail(email);
          results.emailResult = emailResult;
        } catch (error) {
          results.emailError =
            error instanceof Error ? error.message : "Unknown error";
        }
      }

      return { success: true, data: results };
    },
    {
      body: t.Object({
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
      }),
    },
  )

  /**
   * POST /metrics/debug/dbase
   * Test DBase service directly
   */
  .post(
    "/debug/dbase",
    async ({ body }) => {
      const { phone } = body;
      const results: Record<string, unknown> = {};

      if (phone) {
        try {
          const phoneResult = await container.dbase.findCpfByPhone(phone);
          results.phoneResult = phoneResult;
        } catch (error) {
          results.phoneError =
            error instanceof Error ? error.message : "Unknown error";
        }
      }

      return { success: true, data: results };
    },
    {
      body: t.Object({
        phone: t.String(),
      }),
    },
  )

  /**
   * POST /metrics/debug/diretrix
   * Test Diretrix service directly
   */
  .post(
    "/debug/diretrix",
    async ({ body }) => {
      const { phone, email } = body;
      const results: Record<string, unknown> = {};

      if (phone) {
        try {
          const phoneResult = await container.diretrix.findCpfByPhone(phone);
          results.phoneResult = phoneResult;
        } catch (error) {
          results.phoneError =
            error instanceof Error ? error.message : "Unknown error";
        }
      }

      if (email) {
        try {
          const emailResult =
            await container.diretrix.findCpfByEmailWithName(email);
          results.emailResult = emailResult;
        } catch (error) {
          results.emailError =
            error instanceof Error ? error.message : "Unknown error";
        }
      }

      return { success: true, data: results };
    },
    {
      body: t.Object({
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
      }),
    },
  )

  /**
   * GET /metrics/debug/leads
   * Get sample leads from C2S to inspect phone/email
   */
  .get(
    "/debug/leads",
    async ({ query }) => {
      const count = query.count ? parseInt(query.count) : 5;
      const leadsResponse = await container.c2s.getLeads({
        perpage: Math.min(count, 50),
        sort: "-created_at",
      });

      // Return lead data with extracted phone/email for debugging
      const { C2SService } = await import("../services/c2s.service");

      return {
        success: true,
        data: leadsResponse.data.map((lead) => {
          const phone = C2SService.extractPhone(lead);
          const email = C2SService.extractEmail(lead);
          const customerName = C2SService.extractCustomerName(lead);

          return {
            id: lead.id,
            customer: customerName,
            phone,
            email,
            hasPhone: !!phone,
            hasEmail: !!email,
          };
        }),
      };
    },
    {
      query: t.Object({
        count: t.Optional(t.String()),
      }),
    },
  )

  /**
   * GET /metrics/debug/db-status
   * Get lead enrichment status from database
   */
  .get("/debug/db-status", async () => {
    const db = container.dbStorage;

    // Get counts by status
    const completed = await db.getLeadsByStatus(["completed"]);
    const partial = await db.getLeadsByStatus(["partial"]);
    const unenriched = await db.getLeadsByStatus(["unenriched"]);
    const basic = await db.getLeadsByStatus(["basic"]);
    const failed = await db.getLeadsByStatus(["failed"]);
    const processing = await db.getLeadsByStatus(["processing"]);

    return {
      success: true,
      data: {
        summary: {
          completed: completed.length,
          partial: partial.length,
          unenriched: unenriched.length,
          basic: basic.length,
          failed: failed.length,
          processing: processing.length,
          total:
            completed.length +
            partial.length +
            unenriched.length +
            basic.length +
            failed.length +
            processing.length,
        },
        // Show last 10 of each status
        recent: {
          completed: completed
            .slice(-10)
            .map((l) => ({ leadId: l.leadId, name: l.name })),
          unenriched: unenriched
            .slice(-10)
            .map((l) => ({ leadId: l.leadId, name: l.name })),
        },
      },
    };
  })

  /**
   * GET /metrics/debug/cpf-lookup
   * Test cpf-lookup-api (223M CPF database)
   */
  .get(
    "/debug/cpf-lookup",
    async ({ query }) => {
      const { CpfLookupService } =
        await import("../services/cpf-lookup.service");
      const service = new CpfLookupService();

      const results: Record<string, unknown> = {};

      // Health check
      results.healthy = await service.healthCheck();

      // Stats
      results.stats = await service.getStats();

      // CPF lookup if provided
      if (query.cpf) {
        results.cpfLookup = await service.lookupByCpf(query.cpf);
      }

      // Masked lookup if provided
      if (query.masked) {
        results.maskedLookup = await service.lookupByMasked(query.masked);
      }

      return { success: true, data: results };
    },
    {
      query: t.Object({
        cpf: t.Optional(t.String()),
        masked: t.Optional(t.String()),
      }),
    },
  )

  /**
   * POST /metrics/debug/validate-cpf
   * Validate CPF and get real name from 223M database
   */
  .post(
    "/debug/validate-cpf",
    async ({ body }) => {
      const { cpf, leadName } = body;

      const result = await container.cpfDiscovery.validateCpf(cpf, leadName);

      return {
        success: true,
        data: {
          valid: !!result,
          result,
        },
      };
    },
    {
      body: t.Object({
        cpf: t.String(),
        leadName: t.Optional(t.String()),
      }),
    },
  )

  .get("/prometheus", async () => {
    const snapshot = metricsService.getSnapshot();

    const lines = [
      "# HELP enrichment_leads_total Total number of leads processed",
      "# TYPE enrichment_leads_total counter",
      `enrichment_leads_total ${snapshot.totalLeadsProcessed}`,
      "",
      "# HELP enrichment_cpf_discovered_total CPFs successfully discovered",
      "# TYPE enrichment_cpf_discovered_total counter",
      `enrichment_cpf_discovered_total ${snapshot.cpfDiscovered}`,
      "",
      "# HELP enrichment_cpf_not_found_total CPFs not found",
      "# TYPE enrichment_cpf_not_found_total counter",
      `enrichment_cpf_not_found_total ${snapshot.cpfNotFound}`,
      "",
      "# HELP enrichment_work_api_success_total Work API successful requests",
      "# TYPE enrichment_work_api_success_total counter",
      `enrichment_work_api_success_total ${snapshot.workApiSuccess}`,
      "",
      "# HELP enrichment_work_api_timeout_total Work API timeouts",
      "# TYPE enrichment_work_api_timeout_total counter",
      `enrichment_work_api_timeout_total ${snapshot.workApiTimeout}`,
      "",
      "# HELP enrichment_work_api_failure_total Work API failures",
      "# TYPE enrichment_work_api_failure_total counter",
      `enrichment_work_api_failure_total ${snapshot.workApiFailure}`,
      "",
      "# HELP enrichment_work_api_cache_hits_total Work API cache hits",
      "# TYPE enrichment_work_api_cache_hits_total counter",
      `enrichment_work_api_cache_hits_total ${snapshot.workApiCacheHits}`,
      "",
      "# HELP enrichment_c2s_created_total C2S leads created",
      "# TYPE enrichment_c2s_created_total counter",
      `enrichment_c2s_created_total ${snapshot.c2sCreated}`,
      "",
      "# HELP enrichment_c2s_updated_total C2S leads updated",
      "# TYPE enrichment_c2s_updated_total counter",
      `enrichment_c2s_updated_total ${snapshot.c2sUpdated}`,
      "",
      "# HELP enrichment_c2s_failure_total C2S failures",
      "# TYPE enrichment_c2s_failure_total counter",
      `enrichment_c2s_failure_total ${snapshot.c2sFailure}`,
      "",
      "# HELP enrichment_fully_enriched_total Leads fully enriched",
      "# TYPE enrichment_fully_enriched_total counter",
      `enrichment_fully_enriched_total ${snapshot.fullyEnriched}`,
      "",
      "# HELP enrichment_partially_enriched_total Leads partially enriched",
      "# TYPE enrichment_partially_enriched_total counter",
      `enrichment_partially_enriched_total ${snapshot.partiallyEnriched}`,
      "",
      "# HELP enrichment_not_enriched_total Leads not enriched",
      "# TYPE enrichment_not_enriched_total counter",
      `enrichment_not_enriched_total ${snapshot.notEnriched}`,
      "",
      "# HELP enrichment_duration_ms_avg Average enrichment duration in milliseconds",
      "# TYPE enrichment_duration_ms_avg gauge",
      `enrichment_duration_ms_avg ${snapshot.avgEnrichmentTimeMs}`,
      "",
      "# HELP enrichment_duration_ms_min Minimum enrichment duration in milliseconds",
      "# TYPE enrichment_duration_ms_min gauge",
      `enrichment_duration_ms_min ${snapshot.minEnrichmentTimeMs}`,
      "",
      "# HELP enrichment_duration_ms_max Maximum enrichment duration in milliseconds",
      "# TYPE enrichment_duration_ms_max gauge",
      `enrichment_duration_ms_max ${snapshot.maxEnrichmentTimeMs}`,
      "",
      "# HELP enrichment_cpf_discovery_rate CPF discovery rate percentage",
      "# TYPE enrichment_cpf_discovery_rate gauge",
      `enrichment_cpf_discovery_rate ${snapshot.cpfDiscoveryRate}`,
      "",
      "# HELP enrichment_work_api_success_rate Work API success rate percentage",
      "# TYPE enrichment_work_api_success_rate gauge",
      `enrichment_work_api_success_rate ${snapshot.workApiSuccessRate}`,
      "",
      "# HELP enrichment_c2s_success_rate C2S success rate percentage",
      "# TYPE enrichment_c2s_success_rate gauge",
      `enrichment_c2s_success_rate ${snapshot.c2sSuccessRate}`,
      "",
    ];

    return new Response(lines.join("\n"), {
      headers: { "Content-Type": "text/plain; version=0.0.4" },
    });
  });
