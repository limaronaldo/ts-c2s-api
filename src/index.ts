import { Elysia } from "elysia";
import { healthRoute } from "./routes/health";
import { errorHandler } from "./errors/app-error";
import { logger } from "./utils/logger";
import { hasFullConfig, getConfig } from "./config";
import {
  startEnrichmentCron,
  stopEnrichmentCron,
} from "./jobs/enrichment-cron";
import { initializeCaches } from "./utils/cache";
import { closeRedis } from "./utils/redis-cache";
import { rateLimit } from "./middleware/rate-limit";
import { apiKeyAuth, getApiKeysFromEnv } from "./middleware/auth";
import { metricsMiddleware } from "./middleware/metrics";

const app = new Elysia().use(errorHandler).use(healthRoute);

// Only load full routes if all required env vars are present
// This allows the health check to work even without full configuration
if (hasFullConfig()) {
  logger.info("Full configuration detected, loading all routes");

  // Initialize caches (Redis if configured, otherwise in-memory)
  initializeCaches();

  // Add metrics middleware for HTTP request instrumentation
  app.use(metricsMiddleware);

  // Apply rate limiting if enabled
  const config = getConfig();
  if (config.RATE_LIMIT_ENABLED) {
    app.use(
      rateLimit({
        max: config.RATE_LIMIT_MAX,
        windowMs: config.RATE_LIMIT_WINDOW_MS,
        skip: (request) => {
          // Skip rate limiting for health checks
          const url = new URL(request.url);
          return url.pathname === "/health";
        },
      }),
    );
    logger.info(
      { max: config.RATE_LIMIT_MAX, windowMs: config.RATE_LIMIT_WINDOW_MS },
      "Rate limiting enabled",
    );
  }

  // Apply API key authentication if configured
  const apiKeys = getApiKeysFromEnv();
  if (apiKeys.length > 0) {
    app.use(
      apiKeyAuth({
        apiKeys,
        skipPaths: ["/health", "/dashboard", "/webhook"],
      }),
    );
    logger.info({ keyCount: apiKeys.length }, "API key authentication enabled");
  }

  // Dynamically import routes that require full config
  const { leadsRoute } = await import("./routes/leads");
  const { enrichRoute } = await import("./routes/enrich");
  const { webhookRoute } = await import("./routes/webhook");
  const { customerRoute } = await import("./routes/customer");
  const { workApiRoute } = await import("./routes/work-api");
  const { sellersRoute } = await import("./routes/sellers");
  const { tagsRoute } = await import("./routes/tags");
  const { queuesRoute } = await import("./routes/queues");
  const { activitiesRoute } = await import("./routes/activities");
  const { companyRoute } = await import("./routes/company");
  const { metricsRoute } = await import("./routes/metrics");
  const { batchRoute } = await import("./routes/batch");
  const { dashboardRoute } = await import("./routes/dashboard");
  const { discoveryRoute } = await import("./routes/discovery");

  app
    .use(leadsRoute)
    .use(enrichRoute)
    .use(webhookRoute)
    .use(customerRoute)
    .use(workApiRoute)
    .use(sellersRoute)
    .use(tagsRoute)
    .use(queuesRoute)
    .use(activitiesRoute)
    .use(companyRoute)
    .use(metricsRoute)
    .use(batchRoute)
    .use(dashboardRoute)
    .use(discoveryRoute);

  // Start cron job if enabled (RML-619)
  if (config.ENABLE_CRON) {
    startEnrichmentCron({
      enabled: true,
      interval: config.CRON_INTERVAL,
      batchSize: config.CRON_BATCH_SIZE,
      delayMs: config.CRON_DELAY_MS,
    });
  }
} else {
  logger.warn("Running in minimal mode - only health check available");
  logger.warn(
    "Set all required environment variables to enable full functionality",
  );
}

const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";

app.listen({ port: Number(port), hostname: host });

logger.info({ port, host }, `Server started on http://${host}:${port}`);

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  stopEnrichmentCron();
  await closeRedis();
  const { closeDb } = await import("./db/client");
  await closeDb();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  stopEnrichmentCron();
  await closeRedis();
  const { closeDb } = await import("./db/client");
  await closeDb();
  process.exit(0);
});

export { app };
