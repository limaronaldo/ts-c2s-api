import { z } from "zod";

const configSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Database
  DB_URL: z.string().min(1, "DB_URL is required"),

  // C2S API
  C2S_TOKEN: z.string().min(1, "C2S_TOKEN is required"),
  C2S_URL: z.string().url().default("https://c2s.com.br/api/v1"),

  // Work API (Completa Buscas)
  WORK_API: z.string().min(1, "WORK_API is required"),
  WORK_API_URL: z.string().url().default("https://completa.workbuscas.com/api"),

  // Diretrix API
  DIRETRIX_USER: z.string().min(1, "DIRETRIX_USER is required"),
  DIRETRIX_PASS: z.string().min(1, "DIRETRIX_PASS is required"),
  DIRETRIX_URL: z.string().url().default("https://api.diretrix.com.br"),

  // DBase API (fallback) - requires IP whitelisting
  DBASE_KEY: z.string().min(1, "DBASE_KEY is required"),
  DBASE_URL: z
    .string()
    .url()
    .default(
      "https://app.dbase.com.br/sistema/consultas/Data-basebrasil-api2024/",
    ),

  // Mimir API (Azure IBVI fallback)
  MIMIR_TOKEN: z.string().min(1, "MIMIR_TOKEN is required"),
  MIMIR_URL: z.string().url().default("https://ibvi-mimir.azurewebsites.net"),

  // Webhook secret for verification
  WEBHOOK_SECRET: z.string().optional(),

  // Public URL for webhook subscription
  PUBLIC_URL: z.string().url().optional(),

  // Income multiplier (default 1.9x as per Rust implementation)
  INCOME_MULTIPLIER: z.coerce.number().default(1.9),

  // Cron job settings (RML-619)
  ENABLE_CRON: z
    .string()
    .default("false")
    .transform((val) => val.toLowerCase() === "true" || val === "1"),
  CRON_INTERVAL: z.string().default("*/15 * * * *"), // Every 15 minutes
  CRON_BATCH_SIZE: z.coerce.number().default(25),
  CRON_DELAY_MS: z.coerce.number().default(1000),

  // Retry settings (RML-639)
  RETRY_MAX_ATTEMPTS: z.coerce.number().default(5),
  RETRY_ENABLED: z
    .string()
    .default("true")
    .transform((val) => val.toLowerCase() === "true" || val === "1"),

  // Alert settings (RML-639)
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  ALERT_RATE_LIMIT_MINUTES: z.coerce.number().default(5),
  ALERT_ERROR_THRESHOLD: z.coerce.number().default(50), // 50% error rate
  ALERT_ERROR_WINDOW_MINUTES: z.coerce.number().default(10),
  ALERT_SERVICE_DOWN_MINUTES: z.coerce.number().default(5),

  // Email alert settings (RML-795)
  RESEND_API_KEY: z.string().optional(),
  ALERT_EMAIL_ENABLED: z
    .string()
    .default("false")
    .transform((val) => val.toLowerCase() === "true" || val === "1"),
  ALERT_EMAIL_FROM: z.string().email().default("alerts@ts-c2s-api.fly.dev"),
  ALERT_EMAIL_TO: z.string().optional(), // Comma-separated list of emails

  // Redis settings (optional - falls back to in-memory cache)
  REDIS_URL: z.string().url().optional(),
  REDIS_ENABLED: z
    .string()
    .default("false")
    .transform((val) => val.toLowerCase() === "true" || val === "1"),

  // API authentication (optional - disabled if not set)
  API_KEY: z.string().optional(),
  API_KEYS: z.string().optional(), // Comma-separated list

  // Rate limiting
  RATE_LIMIT_ENABLED: z
    .string()
    .default("true")
    .transform((val) => val.toLowerCase() === "true" || val === "1"),
  RATE_LIMIT_MAX: z.coerce.number().default(100), // Max requests per window
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000), // 1 minute window

  // Web Insights settings (auto-insight generation)
  ENABLE_WEB_INSIGHTS: z
    .string()
    .default("true")
    .transform((val) => val.toLowerCase() === "true" || val === "1"),
  INSIGHT_MIN_CONFIDENCE: z.coerce.number().default(60), // 0-100

  // CNPJ Lookup settings (business profile discovery)
  ENABLE_CNPJ_LOOKUP: z
    .string()
    .default("true")
    .transform((val) => val.toLowerCase() === "true" || val === "1"),

  // Google Custom Search settings (web search for insights)
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_CSE_ID: z.string().optional(),
  ENABLE_GOOGLE_SEARCH: z
    .string()
    .default("true")
    .transform((val) => val.toLowerCase() === "true" || val === "1"),
});

export type Config = z.infer<typeof configSchema>;

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.format();
    console.error(
      "Configuration validation failed:",
      JSON.stringify(errors, null, 2),
    );
    throw new Error(`Invalid configuration: ${result.error.message}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

export function hasFullConfig(): boolean {
  const required = [
    "DB_URL",
    "C2S_TOKEN",
    "WORK_API",
    "DIRETRIX_USER",
    "DIRETRIX_PASS",
    // DBASE_TOKEN is optional - DBase is a fallback service
    "MIMIR_TOKEN",
  ];
  return required.every((key) => process.env[key]);
}
