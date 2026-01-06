import client from "prom-client";

// Create a Registry to register metrics
const register = new client.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register });

// ============================================
// Custom Metrics
// ============================================

// Lead enrichment counters
export const enrichmentTotal = new client.Counter({
  name: "c2s_enrichment_total",
  help: "Total number of lead enrichments attempted",
  labelNames: ["status"] as const,
  registers: [register],
});

export const enrichmentDuration = new client.Histogram({
  name: "c2s_enrichment_duration_seconds",
  help: "Duration of lead enrichment in seconds",
  labelNames: ["status"] as const,
  buckets: [1, 5, 10, 30, 60, 120],
  registers: [register],
});

// CPF Discovery metrics
export const cpfDiscoveryTotal = new client.Counter({
  name: "c2s_cpf_discovery_total",
  help: "Total CPF discovery attempts",
  labelNames: ["source", "result"] as const,
  registers: [register],
});

export const cpfDiscoveryDuration = new client.Histogram({
  name: "c2s_cpf_discovery_duration_seconds",
  help: "Duration of CPF discovery in seconds",
  labelNames: ["source"] as const,
  buckets: [0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

// External API metrics
export const externalApiCalls = new client.Counter({
  name: "c2s_external_api_calls_total",
  help: "Total external API calls",
  labelNames: ["service", "status"] as const,
  registers: [register],
});

export const externalApiDuration = new client.Histogram({
  name: "c2s_external_api_duration_seconds",
  help: "Duration of external API calls in seconds",
  labelNames: ["service"] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

// Retry metrics
export const retryTotal = new client.Counter({
  name: "c2s_retry_total",
  help: "Total retry attempts",
  labelNames: ["result"] as const,
  registers: [register],
});

export const retryQueueSize = new client.Gauge({
  name: "c2s_retry_queue_size",
  help: "Current number of leads eligible for retry",
  registers: [register],
});

// Webhook metrics
export const webhookTotal = new client.Counter({
  name: "c2s_webhook_total",
  help: "Total webhooks received",
  labelNames: ["source", "status"] as const,
  registers: [register],
});

// C2S API metrics
export const c2sApiCalls = new client.Counter({
  name: "c2s_api_calls_total",
  help: "Total C2S API calls",
  labelNames: ["operation", "status"] as const,
  registers: [register],
});

// Cache metrics
export const cacheHits = new client.Counter({
  name: "c2s_cache_hits_total",
  help: "Total cache hits",
  labelNames: ["cache_type"] as const,
  registers: [register],
});

export const cacheMisses = new client.Counter({
  name: "c2s_cache_misses_total",
  help: "Total cache misses",
  labelNames: ["cache_type"] as const,
  registers: [register],
});

// Lead status gauge (current state)
export const leadsByStatus = new client.Gauge({
  name: "c2s_leads_by_status",
  help: "Current number of leads by status",
  labelNames: ["status"] as const,
  registers: [register],
});

// Insight metrics
export const insightsGenerated = new client.Counter({
  name: "c2s_insights_generated_total",
  help: "Total insights generated",
  labelNames: ["type"] as const,
  registers: [register],
});

// HTTP request metrics
export const httpRequestsTotal = new client.Counter({
  name: "c2s_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "path", "status"] as const,
  registers: [register],
});

export const httpRequestDuration = new client.Histogram({
  name: "c2s_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "path"] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// ============================================
// Service class
// ============================================

export class PrometheusService {
  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * Get content type for metrics response
   */
  getContentType(): string {
    return register.contentType;
  }

  /**
   * Update lead status gauges from database stats
   */
  updateLeadStatusGauges(stats: Record<string, number>): void {
    // Reset all status gauges first
    leadsByStatus.reset();

    // Set current values
    for (const [status, count] of Object.entries(stats)) {
      leadsByStatus.labels(status).set(count);
    }
  }

  /**
   * Record enrichment attempt
   */
  recordEnrichment(status: string, durationSeconds: number): void {
    enrichmentTotal.labels(status).inc();
    enrichmentDuration.labels(status).observe(durationSeconds);
  }

  /**
   * Record CPF discovery attempt
   */
  recordCpfDiscovery(source: string, found: boolean, durationSeconds: number): void {
    cpfDiscoveryTotal.labels(source, found ? "found" : "not_found").inc();
    cpfDiscoveryDuration.labels(source).observe(durationSeconds);
  }

  /**
   * Record external API call
   */
  recordExternalApiCall(service: string, success: boolean, durationSeconds: number): void {
    externalApiCalls.labels(service, success ? "success" : "error").inc();
    externalApiDuration.labels(service).observe(durationSeconds);
  }

  /**
   * Record retry attempt
   */
  recordRetry(success: boolean): void {
    retryTotal.labels(success ? "success" : "failure").inc();
  }

  /**
   * Update retry queue size
   */
  updateRetryQueueSize(size: number): void {
    retryQueueSize.set(size);
  }

  /**
   * Record webhook received
   */
  recordWebhook(source: string, success: boolean): void {
    webhookTotal.labels(source, success ? "success" : "error").inc();
  }

  /**
   * Record C2S API call
   */
  recordC2sApiCall(operation: string, success: boolean): void {
    c2sApiCalls.labels(operation, success ? "success" : "error").inc();
  }

  /**
   * Record cache hit
   */
  recordCacheHit(cacheType: string): void {
    cacheHits.labels(cacheType).inc();
  }

  /**
   * Record cache miss
   */
  recordCacheMiss(cacheType: string): void {
    cacheMisses.labels(cacheType).inc();
  }

  /**
   * Record insight generated
   */
  recordInsight(type: string): void {
    insightsGenerated.labels(type).inc();
  }

  /**
   * Record HTTP request
   */
  recordHttpRequest(method: string, path: string, status: number, durationSeconds: number): void {
    // Normalize path to avoid high cardinality
    const normalizedPath = this.normalizePath(path);
    httpRequestsTotal.labels(method, normalizedPath, String(status)).inc();
    httpRequestDuration.labels(method, normalizedPath).observe(durationSeconds);
  }

  /**
   * Normalize path to avoid high cardinality metrics
   */
  private normalizePath(path: string): string {
    // Replace UUIDs and IDs with placeholders
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
      .replace(/\/\d+/g, "/:id")
      .replace(/\/[0-9]{11}/g, "/:cpf") // CPF
      .split("?")[0]; // Remove query params
  }
}
