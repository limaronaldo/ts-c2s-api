/**
 * Batch Operations Routes
 * RML-618: Batch Enrichment Endpoint
 *
 * Provides bulk operations for lead enrichment:
 * - POST /batch/enrich-recent: Enrich last N leads from C2S
 * - POST /batch/retry-failed: Retry failed/partial enrichments
 */

import { Elysia, t } from "elysia";
import { container } from "../container";
import { apiLogger } from "../utils/logger";
import { C2SService } from "../services/c2s.service";

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

export const batchRoute = new Elysia({ prefix: "/batch" })
  /**
   * POST /batch/enrich-direct
   * Direct enrichment without C2S integration - for external database leads
   *
   * Takes phone/name and returns enriched person data
   * Uses full 4-tier CPF discovery: Work API → CPF Lookup (223M) → Diretrix → DBase
   * Does NOT store in local database or update C2S
   */
  .post(
    "/enrich-direct",
    async ({ body }) => {
      const { phone, name, email } = body;

      apiLogger.info(
        { phone, name },
        "Direct enrichment request (4-tier CPF discovery)",
      );

      if (!phone && !email) {
        return {
          success: false,
          error: "Phone or email is required for direct enrichment",
        };
      }

      try {
        // Step 1: CPF Discovery using full 4-tier fallback
        // Priority: Work API → CPF Lookup (223M) → Diretrix → DBase
        const cpfResult = await container.cpfDiscovery.findCpf(
          phone || undefined,
          email || undefined,
          name || undefined,
        );

        if (!cpfResult) {
          return {
            success: true,
            data: {
              status: "unenriched",
              message: "CPF not found via any discovery tier",
              phone,
              email,
              name,
            },
          };
        }

        const {
          cpf,
          foundName,
          source: cpfSource,
          nameMatches,
          matchScore,
        } = cpfResult;

        // Step 2: Work API enrichment with full CPF data
        const workResult = await container.workApi.fetchByCpfWithTimeout(cpf);

        if (!workResult.data) {
          return {
            success: true,
            data: {
              status: "partial",
              message: "CPF found but Work API enrichment failed",
              cpf,
              cpfSource,
              foundName,
              nameMatches,
              matchScore,
            },
          };
        }

        const person = workResult.data;

        // Step 3: Search for companies in Meilisearch
        let companies = null;
        if (person.cpf && container.meilisearchCompany.isEnabled()) {
          try {
            const companySummary =
              await container.meilisearchCompany.findCompaniesByCpf(person.cpf);
            if (companySummary.totalCompanies > 0) {
              companies = companySummary;
            }
          } catch (err) {
            apiLogger.warn(
              { cpf: person.cpf, error: err },
              "Meilisearch company search failed",
            );
          }
        }

        return {
          success: true,
          data: {
            status: "completed",
            cpf: person.cpf,
            cpfSource,
            foundName,
            nameMatches,
            matchScore,
            enrichedName: person.nome,
            birthDate: person.dataNascimento,
            gender: person.sexo,
            motherName: person.nomeMae,
            income: person.renda,
            presumedIncome: person.rendaPresumida,
            netWorth: person.patrimonio,
            occupation: person.profissao,
            education: person.escolaridade,
            maritalStatus: person.estadoCivil,
            phones: person.telefones,
            emails: person.emails,
            addresses: person.enderecos,
            companies,
          },
        };
      } catch (error) {
        apiLogger.error({ phone, name, error }, "Direct enrichment failed");
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      body: t.Object({
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
        name: t.Optional(t.String()),
      }),
    },
  )
  /**
   * POST /batch/enrich-recent
   * Fetch and enrich the last N leads from C2S
   *
   * Features:
   * - Fetches recent leads from C2S API
   * - Filters out already enriched leads
   * - Enriches each lead with rate limiting
   * - Returns summary with individual results
   */
  .post(
    "/enrich-recent",
    async ({ body }) => {
      const { count = 25, status, skipEnriched = true, delayMs = 500 } = body;

      apiLogger.info(
        { count, status, skipEnriched },
        "Batch enrichment started",
      );

      const startTime = Date.now();

      // Step 1: Fetch recent leads from C2S
      const leadsResponse = await container.c2s.getLeads({
        perpage: Math.min(count, 50), // C2S max is 50
        status,
        sort: "-created_at", // Most recent first
      });

      const leads = leadsResponse.data;
      apiLogger.info({ fetchedCount: leads.length }, "Fetched leads from C2S");

      // Step 2: Filter leads that haven't been enriched yet (check our database)
      let leadsToEnrich = leads;
      if (skipEnriched) {
        const enrichmentChecks = await Promise.all(
          leads.map(async (lead) => ({
            lead,
            alreadyEnriched: await isLeadEnriched(lead.id),
          })),
        );
        leadsToEnrich = enrichmentChecks
          .filter((check) => !check.alreadyEnriched)
          .map((check) => check.lead);
      }

      apiLogger.info(
        {
          totalFetched: leads.length,
          toEnrich: leadsToEnrich.length,
          skipped: leads.length - leadsToEnrich.length,
        },
        "Filtered leads for enrichment (checked database)",
      );

      // Step 3: Enrich each lead with rate limiting
      const results: Array<{
        leadId: string;
        customer: string;
        success: boolean;
        enriched: boolean;
        partialEnrichment?: boolean;
        cpf?: string;
        message: string;
      }> = [];

      for (let i = 0; i < leadsToEnrich.length; i++) {
        const lead = leadsToEnrich[i];

        apiLogger.debug(
          { leadId: lead.id, index: i + 1, total: leadsToEnrich.length },
          "Processing lead",
        );

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

          results.push({
            leadId: lead.id,
            customer: lead.customer,
            success: result.success,
            enriched: result.enriched,
            partialEnrichment: result.partialEnrichment,
            cpf: result.cpf,
            message: result.message,
          });
        } catch (error) {
          apiLogger.error(
            { leadId: lead.id, error },
            "Failed to enrich lead in batch",
          );
          results.push({
            leadId: lead.id,
            customer: lead.customer,
            success: false,
            enriched: false,
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }

        // Rate limiting between leads (except for last one)
        if (i < leadsToEnrich.length - 1) {
          await sleep(delayMs);
        }
      }

      const elapsed = Date.now() - startTime;
      const enrichedCount = results.filter((r) => r.enriched).length;
      const partialCount = results.filter((r) => r.partialEnrichment).length;
      const failedCount = results.filter((r) => !r.success).length;

      apiLogger.info(
        {
          totalProcessed: results.length,
          enriched: enrichedCount,
          partial: partialCount,
          failed: failedCount,
          elapsedMs: elapsed,
        },
        "Batch enrichment completed",
      );

      return {
        success: true,
        data: {
          summary: {
            totalFetched: leads.length,
            skippedAlreadyEnriched: leads.length - leadsToEnrich.length,
            processed: results.length,
            enriched: enrichedCount,
            partial: partialCount,
            failed: failedCount,
            elapsedMs: elapsed,
          },
          results,
        },
      };
    },
    {
      body: t.Object({
        count: t.Optional(t.Number({ minimum: 1, maximum: 50, default: 25 })),
        status: t.Optional(t.String()),
        skipEnriched: t.Optional(t.Boolean({ default: true })),
        delayMs: t.Optional(
          t.Number({ minimum: 100, maximum: 5000, default: 500 }),
        ),
      }),
    },
  )

  /**
   * POST /batch/retry-failed
   * Retry enrichment for leads that previously failed or got partial enrichment
   */
  .post(
    "/retry-failed",
    async ({ body }) => {
      const { limit = 25, delayMs = 500 } = body;

      apiLogger.info({ limit }, "Batch retry-failed started");

      const startTime = Date.now();

      // Get leads with failed, partial, or unenriched status from our database
      // "unenriched" are now retried because the new policy accepts name mismatches
      const failedLeads = await container.dbStorage.getLeadsByStatus([
        "partial",
        "failed",
        "processing",
        "unenriched",
      ]);

      const leadsToRetry = failedLeads.slice(0, limit);

      apiLogger.info(
        { totalFailed: failedLeads.length, toRetry: leadsToRetry.length },
        "Found leads to retry",
      );

      const results: Array<{
        leadId: string;
        name: string;
        previousStatus: string;
        success: boolean;
        enriched: boolean;
        message: string;
      }> = [];

      for (let i = 0; i < leadsToRetry.length; i++) {
        const lead = leadsToRetry[i];

        apiLogger.debug(
          { leadId: lead.leadId, index: i + 1, total: leadsToRetry.length },
          "Retrying lead",
        );

        // For unenriched leads, fetch fresh data from C2S since we may not have phone/email
        let leadName = lead.name ?? "Unknown";
        let phone = lead.phone ?? undefined;
        let email = lead.email ?? undefined;
        let campaignName = lead.campaignName ?? undefined;

        if (!phone && !email) {
          try {
            const c2sLead = await container.c2s.getLead(lead.leadId);
            if (c2sLead.data) {
              phone = C2SService.extractPhone(c2sLead.data);
              email = C2SService.extractEmail(c2sLead.data);
              leadName = C2SService.extractCustomerName(c2sLead.data);
              campaignName = c2sLead.data.product ?? campaignName;
            }
          } catch {
            apiLogger.warn(
              { leadId: lead.leadId },
              "Could not fetch lead from C2S",
            );
          }
        }

        try {
          const result = await container.enrichment.enrichLead({
            leadId: lead.leadId,
            name: leadName,
            phone,
            email,
            campaignName,
          });

          results.push({
            leadId: lead.leadId,
            name: leadName,
            previousStatus: lead.enrichmentStatus ?? "unknown",
            success: result.success,
            enriched: result.enriched,
            message: result.message,
          });
        } catch (error) {
          apiLogger.error(
            { leadId: lead.leadId, error },
            "Failed to retry lead",
          );
          results.push({
            leadId: lead.leadId,
            name: leadName,
            previousStatus: lead.enrichmentStatus ?? "unknown",
            success: false,
            enriched: false,
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }

        // Rate limiting
        if (i < leadsToRetry.length - 1) {
          await sleep(delayMs);
        }
      }

      const elapsed = Date.now() - startTime;
      const successCount = results.filter((r) => r.enriched).length;

      apiLogger.info(
        {
          retried: results.length,
          nowEnriched: successCount,
          elapsedMs: elapsed,
        },
        "Batch retry completed",
      );

      return {
        success: true,
        data: {
          summary: {
            totalFailed: failedLeads.length,
            retried: results.length,
            nowEnriched: successCount,
            stillFailed: results.length - successCount,
            elapsedMs: elapsed,
          },
          results,
        },
      };
    },
    {
      body: t.Object({
        limit: t.Optional(t.Number({ minimum: 1, maximum: 50, default: 25 })),
        delayMs: t.Optional(
          t.Number({ minimum: 100, maximum: 5000, default: 500 }),
        ),
      }),
    },
  );
