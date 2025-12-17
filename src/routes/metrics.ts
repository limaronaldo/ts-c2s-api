/**
 * Metrics API Routes
 * Exposes enrichment performance metrics
 */

import { Elysia, t } from "elysia";
import { metricsService } from "../services/metrics.service";

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
