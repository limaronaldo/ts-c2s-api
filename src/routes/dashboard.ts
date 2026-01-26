/**
 * Dashboard Route (RML-639)
 *
 * Serves a monitoring dashboard for lead enrichment status.
 * - GET /dashboard - HTML dashboard page
 * - GET /dashboard/data - JSON data for AJAX refresh
 * - GET /dashboard/retryable - List leads eligible for retry
 * - POST /dashboard/retry - Manually trigger retry processing
 * - GET /dashboard/export - Export leads as CSV
 *
 * Protected by Session Auth with custom login page (RML-811)
 */

import { Elysia, t } from "elysia";
import { container } from "../container";
import { metricsService } from "../services/metrics.service";
import { alertService } from "../services/alert.service";
import { EnrichmentService } from "../services/enrichment.service";
import { ReportService } from "../services/report.service";
import type { LeadReportData } from "../templates/lead-report.html";
import {
  getCronStatus,
  triggerManualRun,
  type CronJobConfig,
} from "../jobs/enrichment-cron";
import { generateDashboardHtml } from "../templates/dashboard.html";
import { generateLoginHtml } from "../templates/login.html";
import { getConfig } from "../config";
import { logger } from "../utils/logger";

const dashboardLogger = logger.child({ module: "dashboard" });

// Retry delays in milliseconds (must match enrichment-cron.ts)
const RETRY_DELAYS_MS = [
  1 * 60 * 60 * 1000, // 1 hour
  2 * 60 * 60 * 1000, // 2 hours
  4 * 60 * 60 * 1000, // 4 hours
  8 * 60 * 60 * 1000, // 8 hours
  16 * 60 * 60 * 1000, // 16 hours
];

// Session storage (in-memory, resets on deploy)
const sessions = new Map<string, { user: string; expiresAt: number }>();
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get dashboard auth config from environment
 */
function getDashboardAuthConfig() {
  const user = process.env.DASHBOARD_USER || "admin";
  const password = process.env.DASHBOARD_PASSWORD;

  if (!password) {
    return null;
  }

  return { user, password };
}

/**
 * Generate a random session token
 */
function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create a session for authenticated user
 */
function createSession(user: string): string {
  const token = generateSessionToken();
  sessions.set(token, {
    user,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  });
  return token;
}

/**
 * Validate session token from cookie
 */
function validateSession(token: string | undefined): boolean {
  if (!token) return false;

  const session = sessions.get(token);
  if (!session) return false;

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }

  return true;
}

/**
 * Parse cookies from request
 */
function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader.split(";").reduce(
    (acc, cookie) => {
      const [key, value] = cookie.trim().split("=");
      if (key && value) acc[key] = value;
      return acc;
    },
    {} as Record<string, string>,
  );
}

/**
 * Routes that don't require auth (login page and login action)
 */
const PUBLIC_PATHS = ["/dashboard/login"];

export const dashboardRoute = new Elysia({ prefix: "/dashboard" })
  // Session-based auth for all dashboard routes (RML-811)
  .onBeforeHandle(({ request }) => {
    const config = getDashboardAuthConfig();
    const url = new URL(request.url);

    // If no password configured, auth is disabled
    if (!config) {
      return;
    }

    // Allow public paths (login page)
    if (PUBLIC_PATHS.includes(url.pathname)) {
      return;
    }

    // Check session cookie
    const cookies = parseCookies(request.headers.get("Cookie"));
    const sessionToken = cookies["dashboard_session"];

    if (!validateSession(sessionToken)) {
      // Redirect to login page
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/dashboard/login",
        },
      });
    }

    dashboardLogger.debug("Dashboard session valid");
  })

  /**
   * GET /dashboard/login - Show login page
   */
  .get("/login", ({ request }) => {
    const config = getDashboardAuthConfig();

    // If auth disabled, redirect to dashboard
    if (!config) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard" },
      });
    }

    // If already logged in, redirect to dashboard
    const cookies = parseCookies(request.headers.get("Cookie"));
    if (validateSession(cookies["dashboard_session"])) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard" },
      });
    }

    const url = new URL(request.url);
    const error = url.searchParams.get("error");

    const html = generateLoginHtml(
      error === "invalid" ? "Usuário ou senha incorretos" : undefined,
    );

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  })

  /**
   * POST /dashboard/login - Process login (accepts form data)
   */
  .post("/login", async ({ request }) => {
    const config = getDashboardAuthConfig();

    if (!config) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard" },
      });
    }

    // Parse form data
    const contentType = request.headers.get("Content-Type") || "";
    let username = "";
    let password = "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      username = formData.get("username")?.toString() || "";
      password = formData.get("password")?.toString() || "";
    } else if (contentType.includes("application/json")) {
      const json = await request.json();
      username = json.username || "";
      password = json.password || "";
    }

    if (username === config.user && password === config.password) {
      // Create session
      const token = createSession(username);

      dashboardLogger.info({ user: username }, "Dashboard login successful");

      return new Response(null, {
        status: 302,
        headers: {
          Location: "/dashboard",
          "Set-Cookie": `dashboard_session=${token}; Path=/dashboard; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_MS / 1000}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
        },
      });
    }

    dashboardLogger.warn({ user: username }, "Dashboard login failed");

    return new Response(null, {
      status: 302,
      headers: { Location: "/dashboard/login?error=invalid" },
    });
  })

  /**
   * GET /dashboard/logout - Logout
   */
  .get("/logout", ({ request }) => {
    const cookies = parseCookies(request.headers.get("Cookie"));
    const sessionToken = cookies["dashboard_session"];

    if (sessionToken) {
      sessions.delete(sessionToken);
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: "/dashboard/login",
        "Set-Cookie":
          "dashboard_session=; Path=/dashboard; HttpOnly; Max-Age=0",
      },
    });
  })
  /**
   * GET /dashboard - Serve HTML dashboard
   */
  .get("/", async () => {
    const html = generateDashboardHtml();
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  })

  /**
   * GET /dashboard/data - JSON data for dashboard
   * Query params:
   * - dateFrom: ISO date string (e.g., 2025-01-01)
   * - dateTo: ISO date string (e.g., 2025-01-31)
   * - preset: 'today' | '7d' | '30d' | 'all'
   */
  .get(
    "/data",
    async ({ query }) => {
      try {
        // Parse date filters
        let dateFrom: Date | undefined;
        let dateTo: Date | undefined;

        if (query.preset) {
          const now = new Date();
          dateTo = new Date(now);
          dateTo.setHours(23, 59, 59, 999);

          switch (query.preset) {
            case "today":
              dateFrom = new Date(now);
              dateFrom.setHours(0, 0, 0, 0);
              break;
            case "7d":
              dateFrom = new Date(now);
              dateFrom.setDate(dateFrom.getDate() - 7);
              dateFrom.setHours(0, 0, 0, 0);
              break;
            case "30d":
              dateFrom = new Date(now);
              dateFrom.setDate(dateFrom.getDate() - 30);
              dateFrom.setHours(0, 0, 0, 0);
              break;
            case "all":
              dateFrom = undefined;
              dateTo = undefined;
              break;
          }
        } else {
          if (query.dateFrom) {
            dateFrom = new Date(query.dateFrom);
            dateFrom.setHours(0, 0, 0, 0);
          }
          if (query.dateTo) {
            dateTo = new Date(query.dateTo);
            dateTo.setHours(23, 59, 59, 999);
          }
        }

        // Get metrics snapshot (session-based, not filtered by date)
        const metrics = metricsService.getSnapshot();

        // Get lead status counts from database (filtered by date)
        const stats = await container.dbStorage.getLeadStats(dateFrom, dateTo);

        // Get recent leads (filtered by date)
        const recentLeads = await container.dbStorage.getRecentLeads(
          100,
          dateFrom,
          dateTo,
        );

        // Get failed leads (filtered by date)
        const failedLeads = await container.dbStorage.getFailedLeads(
          50,
          dateFrom,
          dateTo,
        );

        // Get cron status
        const cronStatus = getCronStatus();

        // Get service health
        const serviceHealth = alertService.getServiceHealth();

        // Get error rate stats
        const errorRate = alertService.getErrorRateStats();

        return {
          success: true,
          data: {
            metrics,
            stats,
            recentLeads,
            failedLeads,
            cronStatus,
            serviceHealth,
            errorRate,
            timestamp: new Date().toISOString(),
            dateFilter: {
              dateFrom: dateFrom?.toISOString() ?? null,
              dateTo: dateTo?.toISOString() ?? null,
              preset: query.preset ?? null,
            },
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      query: t.Object({
        dateFrom: t.Optional(t.String()),
        dateTo: t.Optional(t.String()),
        preset: t.Optional(
          t.Union([
            t.Literal("today"),
            t.Literal("7d"),
            t.Literal("30d"),
            t.Literal("all"),
          ]),
        ),
      }),
    },
  )

  /**
   * GET /dashboard/retryable - List leads eligible for retry
   */
  .get("/retryable", async () => {
    try {
      const config = getConfig();
      const retryableLeads = await container.dbStorage.getRetryableLeads(
        config.RETRY_MAX_ATTEMPTS,
        RETRY_DELAYS_MS,
      );

      return {
        success: true,
        data: {
          count: retryableLeads.length,
          maxRetries: config.RETRY_MAX_ATTEMPTS,
          retryEnabled: config.RETRY_ENABLED,
          leads: retryableLeads.map((lead) => ({
            id: lead.id,
            leadId: lead.leadId,
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            status: lead.enrichmentStatus,
            retryCount: lead.retryCount ?? 0,
            lastRetryAt: lead.lastRetryAt,
            lastError: lead.lastError,
            createdAt: lead.createdAt,
            nextRetryDelay:
              RETRY_DELAYS_MS[
                Math.min(lead.retryCount ?? 0, RETRY_DELAYS_MS.length - 1)
              ] /
                60000 +
              " min",
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })

  /**
   * POST /dashboard/retry - Manually trigger retry processing
   */
  .post("/retry", async () => {
    try {
      const config = getConfig();

      if (!config.RETRY_ENABLED) {
        return {
          success: false,
          error: "Retry is disabled in configuration",
        };
      }

      dashboardLogger.info("Manual retry triggered from dashboard");

      const cronConfig: CronJobConfig = {
        enabled: true,
        interval: config.CRON_INTERVAL,
        batchSize: config.CRON_BATCH_SIZE,
        delayMs: config.CRON_DELAY_MS,
      };

      // Run in background to avoid timeout
      triggerManualRun(cronConfig).catch((err) => {
        dashboardLogger.error({ error: err }, "Manual retry run failed");
      });

      return {
        success: true,
        message: "Retry processing started in background",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })

  /**
   * GET /dashboard/reprocess - Get leads eligible for reprocessing
   */
  .get(
    "/reprocess",
    async ({ query }) => {
      try {
        const limit = query.limit || 50;
        const leads = await container.dbStorage.getLeadsForReprocessing(limit);

        return {
          success: true,
          data: {
            count: leads.length,
            leads: leads.map((lead) => ({
              id: lead.id,
              leadId: lead.leadId,
              name: lead.name,
              phone: lead.phone,
              email: lead.email,
              status: lead.enrichmentStatus,
              retryCount: lead.retryCount ?? 0,
              createdAt: lead.createdAt,
            })),
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.Numeric()),
      }),
    },
  )

  /**
   * POST /dashboard/reprocess - Reprocess leads from local database
   * This bypasses C2S API and processes leads directly from our DB
   */
  .post(
    "/reprocess",
    async ({ query }) => {
      try {
        const limit = query.limit || 25;
        const delayMs = query.delay || 2000;

        dashboardLogger.info(
          { limit, delayMs },
          "Manual reprocess triggered from dashboard",
        );

        // Get leads from local DB that need reprocessing
        const leads = await container.dbStorage.getLeadsForReprocessing(limit);

        if (leads.length === 0) {
          return {
            success: true,
            message: "No leads to reprocess",
            data: { processed: 0 },
          };
        }

        dashboardLogger.info(
          { count: leads.length },
          "Found leads for reprocessing",
        );

        // Process in background to avoid timeout
        const enrichmentService = new EnrichmentService();
        const { C2SService } = await import("../services/c2s.service");
        const c2sService = new C2SService();

        (async () => {
          let processed = 0;
          let success = 0;
          let failed = 0;
          let skipped = 0;

          for (const lead of leads) {
            try {
              // Fetch lead data from C2S API if we don't have contact info
              let name: string | null | undefined = lead.name;
              let phone: string | null | undefined = lead.phone;
              let email: string | null | undefined = lead.email;
              let campaignName: string | null | undefined = lead.campaignName;

              if (!name && !phone && !email) {
                dashboardLogger.info(
                  { leadId: lead.leadId },
                  "Fetching lead data from C2S API",
                );

                try {
                  const c2sLead = await c2sService.getLead(lead.leadId);
                  if (c2sLead?.data) {
                    name = C2SService.extractCustomerName(c2sLead.data);
                    phone = C2SService.extractPhone(c2sLead.data);
                    email = C2SService.extractEmail(c2sLead.data);
                    campaignName =
                      c2sLead.data.attributes?.product?.description ||
                      campaignName;

                    dashboardLogger.info(
                      { leadId: lead.leadId, name, phone, email },
                      "Got lead data from C2S",
                    );
                  }
                } catch (err) {
                  dashboardLogger.warn(
                    { leadId: lead.leadId, error: err },
                    "Failed to fetch lead from C2S, skipping",
                  );
                  skipped++;
                  continue;
                }
              }

              // Skip if still no contact info
              if (!name && !phone && !email) {
                dashboardLogger.warn(
                  { leadId: lead.leadId },
                  "Skipping lead - no contact info even after C2S fetch",
                );
                skipped++;
                continue;
              }

              dashboardLogger.info(
                { leadId: lead.leadId, name, phone },
                "Reprocessing lead",
              );

              const result = await enrichmentService.enrichLead({
                leadId: lead.leadId,
                name: name || "Unknown",
                phone: phone || undefined,
                email: email || undefined,
                campaignName: campaignName || undefined,
              });

              processed++;
              if (result.success && result.enriched) {
                success++;
              } else {
                failed++;
              }

              dashboardLogger.info(
                { leadId: lead.leadId, result: result.message },
                "Lead reprocessed",
              );

              // Delay between enrichments (includes C2S rate limit)
              if (processed < leads.length) {
                await new Promise((r) => setTimeout(r, delayMs));
              }
            } catch (err) {
              failed++;
              dashboardLogger.error(
                { leadId: lead.leadId, error: err },
                "Failed to reprocess lead",
              );
            }
          }

          dashboardLogger.info(
            { processed, success, failed, skipped },
            "Reprocess batch completed",
          );
        })();

        return {
          success: true,
          message: `Reprocessing ${leads.length} leads in background`,
          data: {
            queued: leads.length,
            leadIds: leads.map((l) => l.leadId),
          },
        };
      } catch (error) {
        dashboardLogger.error({ error }, "Reprocess failed");
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.Numeric()),
        delay: t.Optional(t.Numeric()),
      }),
    },
  )

  /**
   * GET /dashboard/export - Export leads as CSV
   */
  .get(
    "/export",
    async ({ query }) => {
      try {
        const { status, limit = 1000, format = "csv" } = query;

        let leads;
        if (status === "failed") {
          leads = await container.dbStorage.getFailedLeads(limit);
        } else if (status) {
          leads = await container.dbStorage.getLeadsByStatus([status]);
        } else {
          leads = await container.dbStorage.getRecentLeads(limit);
        }

        if (format === "json") {
          return {
            success: true,
            data: leads,
            count: leads.length,
          };
        }

        // CSV format
        const headers = [
          "id",
          "lead_id",
          "name",
          "phone",
          "email",
          "status",
          "retry_count",
          "last_retry_at",
          "last_error",
          "created_at",
        ];

        const rows = leads.map((lead) => [
          lead.id,
          lead.leadId,
          lead.name ?? "",
          lead.phone ?? "",
          lead.email ?? "",
          lead.enrichmentStatus ?? "",
          lead.retryCount ?? 0,
          lead.lastRetryAt?.toISOString() ?? "",
          (lead.lastError ?? "").replace(/"/g, '""'),
          lead.createdAt.toISOString(),
        ]);

        const csv = [
          headers.join(","),
          ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
        ].join("\n");

        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="leads-${status || "all"}-${new Date().toISOString().split("T")[0]}.csv"`,
          },
        });
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
        format: t.Optional(t.Union([t.Literal("csv"), t.Literal("json")])),
      }),
    },
  )

  /**
   * POST /dashboard/report - Generate PDF report for leads
   * RML-871: Geração automática de relatórios PDF de análise de leads
   *
   * Body: Array of lead analysis data
   * Query params:
   * - format: 'pdf' | 'html' (default: pdf)
   * - title: Custom report title
   */
  .post(
    "/report",
    async ({ body, query }) => {
      try {
        const reportService = new ReportService();
        const format = query.format || "pdf";

        // Convert body leads to LeadReportData format
        const leads: LeadReportData[] = body.leads.map((lead) =>
          ReportService.formatLeadForReport(
            {
              id: lead.id || crypto.randomUUID(),
              name: lead.name,
              email: lead.email,
              phone: lead.phone,
              user_latitude: lead.latitude,
              user_longitude: lead.longitude,
            },
            {
              tier: lead.tier as LeadReportData["tier"],
              tierLabel: lead.tierLabel,
              company: lead.company,
              role: lead.role,
              fullName: lead.fullName,
              origin: lead.origin,
              education: lead.education,
              instagram: lead.instagram,
              linkedIn: lead.linkedIn,
              assets: lead.assets,
              totalWealth: lead.totalWealth,
              managedCapital: lead.managedCapital,
              income: lead.income,
              portfolio: lead.portfolio,
              alerts: lead.alerts,
              highlights: lead.highlights,
              recommendation: lead.recommendation,
              sources: lead.sources,
            },
          ),
        );

        const reportData = ReportService.createReportData(leads, {
          title: query.title,
        });

        if (format === "html") {
          const html = reportService.generateHtml(reportData);
          return new Response(html, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }

        // Generate PDF
        const pdfBuffer = await reportService.generatePdf(reportData);
        const filename = `lead-report-${new Date().toISOString().split("T")[0]}.pdf`;

        return new Response(new Uint8Array(pdfBuffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      } catch (error) {
        dashboardLogger.error({ error }, "Failed to generate report");
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      body: t.Object({
        leads: t.Array(
          t.Object({
            id: t.Optional(t.String()),
            name: t.String(),
            email: t.Optional(t.String()),
            phone: t.Optional(t.String()),
            latitude: t.Optional(t.String()),
            longitude: t.Optional(t.String()),
            tier: t.Optional(t.String()),
            tierLabel: t.Optional(t.String()),
            company: t.Optional(t.String()),
            role: t.Optional(t.String()),
            fullName: t.Optional(t.String()),
            origin: t.Optional(t.String()),
            education: t.Optional(t.String()),
            instagram: t.Optional(t.String()),
            linkedIn: t.Optional(t.String()),
            assets: t.Optional(
              t.Array(t.Object({ name: t.String(), value: t.String() })),
            ),
            totalWealth: t.Optional(t.String()),
            managedCapital: t.Optional(t.String()),
            income: t.Optional(t.String()),
            portfolio: t.Optional(
              t.Array(t.Object({ company: t.String(), sector: t.String() })),
            ),
            alerts: t.Optional(t.Array(t.String())),
            highlights: t.Optional(t.Array(t.String())),
            recommendation: t.Optional(
              t.Object({
                action: t.Union([
                  t.Literal("avoid"),
                  t.Literal("priority"),
                  t.Literal("qualify"),
                  t.Literal("contact"),
                ]),
                title: t.String(),
                description: t.String(),
              }),
            ),
            sources: t.Optional(t.Array(t.String())),
          }),
        ),
      }),
      query: t.Object({
        format: t.Optional(t.Union([t.Literal("pdf"), t.Literal("html")])),
        title: t.Optional(t.String()),
      }),
    },
  );
