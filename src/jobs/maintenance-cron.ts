/**
 * Weekly Maintenance Cron Job
 *
 * Runs every Sunday at 3:00 AM São Paulo time
 *
 * Tasks:
 * 1. Normalize phones with duplicate 55 prefix
 * 2. Flag invalid phones (fake patterns, invalid DDDs)
 * 3. Report enrichment statistics
 * 4. Clean up old processing cache
 */

import { logger } from "../utils/logger";
import postgres from "postgres";
import { getConfig } from "../config";

const maintenanceLogger = logger.child({ module: "maintenance-cron" });

// Valid Brazilian DDDs
const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, // SP
  21, 22, 24, // RJ
  27, 28, // ES
  31, 32, 33, 34, 35, 37, 38, // MG
  41, 42, 43, 44, 45, 46, // PR
  47, 48, 49, // SC
  51, 53, 54, 55, // RS
  61, // DF
  62, 64, // GO
  63, // TO
  65, 66, // MT
  67, // MS
  68, // AC
  69, // RO
  71, 73, 74, 75, 77, // BA
  79, // SE
  81, 82, 83, 84, 85, 86, 87, 88, 89, // NE
  91, 92, 93, 94, 95, 96, 97, 98, 99, // Norte
]);

// Fake phone patterns
const FAKE_PHONE_PATTERNS = [
  /^(\d)\1{8,}$/, // All same digit (9+ times)
  /^12345/, // Sequential
  /^0{5,}/, // Many zeros
  /^9{5,}/, // Many nines
];

let maintenanceTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let isStopped = false;

interface MaintenanceResult {
  normalizedPhones: number;
  flaggedInvalid: number;
  stats: {
    total: number;
    enriched: number;
    unenriched: number;
    rate: number;
  };
}

/**
 * Get milliseconds until next Sunday 3:00 AM São Paulo time
 */
function getMsUntilNextSunday3AM(): number {
  const now = new Date();

  // Convert to São Paulo time
  const spNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));

  // Find next Sunday
  const daysUntilSunday = (7 - spNow.getDay()) % 7 || 7; // 0 = Sunday

  const nextSunday = new Date(spNow);
  nextSunday.setDate(spNow.getDate() + daysUntilSunday);
  nextSunday.setHours(3, 0, 0, 0);

  // If it's already past 3 AM on Sunday, schedule for next week
  if (spNow.getDay() === 0 && spNow.getHours() >= 3) {
    nextSunday.setDate(nextSunday.getDate() + 7);
  }

  // Calculate milliseconds difference
  const msUntil = nextSunday.getTime() - spNow.getTime();

  return Math.max(msUntil, 0);
}

/**
 * Normalize phones with duplicate 55 prefix
 */
async function normalizePhones(sql: postgres.Sql): Promise<number> {
  // Find leads with 55 prefix that have valid DDD after
  const leadsToNormalize = await sql`
    SELECT id, customer_phone, customer_phone_normalized
    FROM c2s.leads
    WHERE customer_phone_normalized LIKE '55%'
      AND LENGTH(customer_phone_normalized) >= 13
  `;

  let normalized = 0;

  for (const lead of leadsToNormalize) {
    const phone = lead.customer_phone_normalized;
    if (!phone) continue;

    // Remove 55 prefix
    const withoutPrefix = phone.slice(2);
    const ddd = parseInt(withoutPrefix.slice(0, 2));

    // Only normalize if resulting DDD is valid
    if (VALID_DDDS.has(ddd)) {
      await sql`
        UPDATE c2s.leads
        SET customer_phone_normalized = ${withoutPrefix}
        WHERE id = ${lead.id}
      `;

      // Mark as pending for re-enrichment if not already enriched
      await sql`
        UPDATE c2s.enriched_leads
        SET enrichment_status = 'pending'
        WHERE lead_id = ${lead.id}
          AND cpf IS NULL
          AND enrichment_status != 'completed'
      `;

      normalized++;
    }
  }

  return normalized;
}

/**
 * Flag phones with invalid patterns
 */
async function flagInvalidPhones(sql: postgres.Sql): Promise<number> {
  // Get unenriched leads
  const leads = await sql`
    SELECT l.id, l.customer_phone_normalized as phone
    FROM c2s.leads l
    LEFT JOIN c2s.enriched_leads e ON l.id = e.lead_id
    WHERE (e.cpf IS NULL OR e.enrichment_status IN ('pending', 'unenriched'))
      AND l.customer_phone_normalized IS NOT NULL
  `;

  let flagged = 0;

  for (const lead of leads) {
    const phone = lead.phone?.replace(/\D/g, "") || "";
    let isInvalid = false;
    let reason = "";

    // Check for invalid DDD
    if (phone.length >= 2) {
      const ddd = parseInt(phone.slice(0, 2));
      if (!VALID_DDDS.has(ddd)) {
        isInvalid = true;
        reason = `Invalid DDD: ${ddd}`;
      }
    }

    // Check for fake patterns
    if (!isInvalid) {
      for (const pattern of FAKE_PHONE_PATTERNS) {
        if (pattern.test(phone)) {
          isInvalid = true;
          reason = "Fake phone pattern";
          break;
        }
      }
    }

    // Check for too short
    if (!isInvalid && phone.length < 10) {
      isInvalid = true;
      reason = `Phone too short: ${phone.length} digits`;
    }

    if (isInvalid) {
      await sql`
        INSERT INTO c2s.enriched_leads (lead_id, enrichment_status, created_at)
        VALUES (${lead.id}, 'invalid_phone', NOW())
        ON CONFLICT (lead_id) DO UPDATE
        SET enrichment_status = 'invalid_phone',
            enriched_at = NOW()
        WHERE c2s.enriched_leads.cpf IS NULL
      `;
      flagged++;
    }
  }

  return flagged;
}

/**
 * Get enrichment statistics
 */
async function getEnrichmentStats(sql: postgres.Sql): Promise<{
  total: number;
  enriched: number;
  unenriched: number;
  rate: number;
}> {
  const result = await sql`
    SELECT
      COUNT(DISTINCT l.id) as total,
      COUNT(DISTINCT CASE WHEN e.cpf IS NOT NULL THEN l.id END) as enriched,
      COUNT(DISTINCT CASE WHEN e.cpf IS NULL OR e.cpf = '' THEN l.id END) as unenriched
    FROM c2s.leads l
    LEFT JOIN c2s.enriched_leads e ON l.id = e.lead_id
  `;

  const total = Number(result[0].total) || 0;
  const enriched = Number(result[0].enriched) || 0;
  const unenriched = total - enriched;
  const rate = total > 0 ? (enriched / total) * 100 : 0;

  return { total, enriched, unenriched, rate: Math.round(rate * 10) / 10 };
}

/**
 * Run maintenance tasks
 */
async function runMaintenance(): Promise<MaintenanceResult> {
  const config = getConfig();

  // Use leads-mb database for batch operations
  const dbUrl = "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";
  const sql = postgres(dbUrl, { ssl: "require" });

  try {
    maintenanceLogger.info("Starting weekly maintenance tasks");

    // 1. Normalize phones
    const normalizedPhones = await normalizePhones(sql);
    maintenanceLogger.info({ count: normalizedPhones }, "Normalized phones with 55 prefix");

    // 2. Flag invalid phones
    const flaggedInvalid = await flagInvalidPhones(sql);
    maintenanceLogger.info({ count: flaggedInvalid }, "Flagged invalid phones");

    // 3. Get stats
    const stats = await getEnrichmentStats(sql);
    maintenanceLogger.info(
      {
        total: stats.total,
        enriched: stats.enriched,
        unenriched: stats.unenriched,
        rate: `${stats.rate}%`,
      },
      "Enrichment statistics"
    );

    return { normalizedPhones, flaggedInvalid, stats };
  } finally {
    await sql.end();
  }
}

/**
 * Run maintenance cycle
 */
async function runMaintenanceCycle(): Promise<void> {
  if (isRunning) {
    maintenanceLogger.warn("Previous maintenance cycle still running, skipping");
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    const result = await runMaintenance();
    const elapsed = Date.now() - startTime;

    maintenanceLogger.info(
      {
        normalizedPhones: result.normalizedPhones,
        flaggedInvalid: result.flaggedInvalid,
        enrichmentRate: `${result.stats.rate}%`,
        elapsedMs: elapsed,
      },
      "Weekly maintenance completed"
    );
  } catch (error) {
    maintenanceLogger.error({ error }, "Maintenance cycle failed");
  } finally {
    isRunning = false;
  }
}

/**
 * Schedule next maintenance run
 */
function scheduleNextRun(): void {
  if (isStopped) return;

  const msUntilNext = getMsUntilNextSunday3AM();
  const nextRunDate = new Date(Date.now() + msUntilNext);

  maintenanceLogger.info(
    {
      nextRun: nextRunDate.toISOString(),
      hoursUntil: Math.round(msUntilNext / (60 * 60 * 1000)),
    },
    "Scheduled next maintenance run"
  );

  maintenanceTimer = setTimeout(async () => {
    await runMaintenanceCycle();
    scheduleNextRun();
  }, msUntilNext);
}

/**
 * Start the maintenance cron
 */
export function startMaintenanceCron(): void {
  if (maintenanceTimer) {
    maintenanceLogger.warn("Maintenance cron already running, stopping previous");
    clearTimeout(maintenanceTimer);
  }

  isStopped = false;

  maintenanceLogger.info(
    { schedule: "Every Sunday at 3:00 AM (São Paulo time)" },
    "Starting maintenance cron"
  );

  scheduleNextRun();
}

/**
 * Stop the maintenance cron
 */
export function stopMaintenanceCron(): void {
  isStopped = true;
  if (maintenanceTimer) {
    clearTimeout(maintenanceTimer);
    maintenanceTimer = null;
    maintenanceLogger.info("Maintenance cron stopped");
  }
}

/**
 * Trigger manual maintenance run
 */
export async function triggerManualMaintenance(): Promise<MaintenanceResult> {
  maintenanceLogger.info("Manual maintenance triggered");
  return runMaintenance();
}

/**
 * Get maintenance cron status
 */
export function getMaintenanceStatus(): {
  running: boolean;
  isProcessing: boolean;
  nextRun: Date | null;
} {
  const msUntilNext = getMsUntilNextSunday3AM();
  const nextRun = maintenanceTimer ? new Date(Date.now() + msUntilNext) : null;

  return {
    running: maintenanceTimer !== null && !isStopped,
    isProcessing: isRunning,
    nextRun,
  };
}
