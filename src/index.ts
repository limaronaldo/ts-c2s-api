import { Elysia } from "elysia";
import { healthRoute } from "./routes/health";
import { errorHandler } from "./errors/app-error";
import { logger } from "./utils/logger";
import { hasFullConfig } from "./config";

const app = new Elysia().use(errorHandler).use(healthRoute);

// Only load full routes if all required env vars are present
// This allows the health check to work even without full configuration
if (hasFullConfig()) {
  logger.info("Full configuration detected, loading all routes");

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
    .use(companyRoute);
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
  const { closeDb } = await import("./db/client");
  await closeDb();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  const { closeDb } = await import("./db/client");
  await closeDb();
  process.exit(0);
});

export { app };
