/**
 * Discovery Routes - CPF Discovery and Bulk Enrichment
 *
 * Provides endpoints for:
 * - CPF lookup by name (DuckDB with 223M records)
 * - Bulk enrichment for lists of persons
 * - Report generation (MD, HTML, PDF)
 */

import { Elysia, t } from "elysia";
import { container } from "../container";
import { apiLogger } from "../utils/logger";

export const discoveryRoute = new Elysia({ prefix: "/discovery" })
  /**
   * GET /discovery/cpf/health
   * Check if CPF Lookup API is healthy
   */
  .get("/cpf/health", async () => {
    const health = await container.cpfLookup.healthCheck();
    return {
      success: health.ok,
      data: health,
    };
  })

  /**
   * GET /discovery/cpf/search/:name
   * Search for CPF by name
   *
   * IMPORTANT: This endpoint can be slow (2+ minutes) for name searches
   * as it scans 223M records in DuckDB
   */
  .get(
    "/cpf/search/:name",
    async ({ params }) => {
      const { name } = params;

      apiLogger.info({ name }, "CPF search by name");

      const result = await container.cpfLookup.searchByName(name);

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      return {
        success: true,
        data: {
          query: name,
          count: result.count,
          results: result.results,
        },
      };
    },
    {
      params: t.Object({
        name: t.String({ minLength: 3 }),
      }),
    },
  )

  /**
   * GET /discovery/cpf/:cpf
   * Get person data by CPF from DuckDB
   */
  .get(
    "/cpf/:cpf",
    async ({ params }) => {
      const { cpf } = params;

      apiLogger.info({ cpf: cpf.substring(0, 3) + "***" }, "CPF lookup");

      const result = await container.cpfLookup.getByCpf(cpf);

      if (!result) {
        return {
          success: false,
          error: "CPF not found",
        };
      }

      return {
        success: true,
        data: result,
      };
    },
    {
      params: t.Object({
        cpf: t.String({ minLength: 11, maxLength: 14 }),
      }),
    },
  )

  /**
   * POST /discovery/cpf/best-match
   * Find best CPF match for a name
   *
   * Returns the single best match (exact name match or first result)
   */
  .post(
    "/cpf/best-match",
    async ({ body }) => {
      const { name } = body;

      apiLogger.info({ name }, "CPF best match search");

      const result = await container.cpfLookup.findBestMatch(name);

      if (!result) {
        return {
          success: false,
          error: "No match found",
        };
      }

      return {
        success: true,
        data: result,
      };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 3 }),
      }),
    },
  )

  /**
   * POST /discovery/bulk/search-cpfs
   * Search CPFs for multiple names
   *
   * Processes names in series with delay to avoid API overload
   */
  .post(
    "/bulk/search-cpfs",
    async ({ body }) => {
      const { names, delayMs = 1000 } = body;

      apiLogger.info({ count: names.length }, "Bulk CPF search started");

      const startTime = Date.now();
      const results: Array<{
        name: string;
        found: boolean;
        cpf?: string;
        fullName?: string;
        count?: number;
        error?: string;
      }> = [];

      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const result = await container.cpfLookup.findBestMatch(name);

        if (result) {
          results.push({
            name,
            found: true,
            cpf: result.cpf,
            fullName: result.nome_completo,
          });
        } else {
          results.push({
            name,
            found: false,
            error: "No match found",
          });
        }

        // Delay between searches
        if (i < names.length - 1 && delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      const elapsed = Date.now() - startTime;
      const foundCount = results.filter((r) => r.found).length;

      apiLogger.info(
        { total: names.length, found: foundCount, elapsedMs: elapsed },
        "Bulk CPF search completed",
      );

      return {
        success: true,
        data: {
          summary: {
            total: names.length,
            found: foundCount,
            notFound: names.length - foundCount,
            elapsedMs: elapsed,
          },
          results,
        },
      };
    },
    {
      body: t.Object({
        names: t.Array(t.String({ minLength: 3 }), {
          minItems: 1,
          maxItems: 50,
        }),
        delayMs: t.Optional(
          t.Number({ minimum: 500, maximum: 5000, default: 1000 }),
        ),
      }),
    },
  )

  /**
   * POST /discovery/bulk/enrich
   * Bulk enrichment - combines CPF discovery + Work API enrichment + DB storage
   *
   * Accepts list of persons with optional CPF/phone/name
   * Returns enriched data for each
   */
  .post(
    "/bulk/enrich",
    async ({ body }) => {
      const { persons, delayMs = 2000, saveToDb = true } = body;

      apiLogger.info(
        { count: persons.length, saveToDb },
        "Bulk enrichment started",
      );

      const result = await container.bulkEnrichment.enrichBulk(persons, {
        delayMs,
        saveToDb,
        onProgress: (current, total, enrichedPerson) => {
          apiLogger.debug(
            { current, total, status: enrichedPerson.status },
            "Bulk enrichment progress",
          );
        },
      });

      return {
        success: true,
        data: result,
      };
    },
    {
      body: t.Object({
        persons: t.Array(
          t.Object({
            name: t.Optional(t.String()),
            cpf: t.Optional(t.String()),
            phone: t.Optional(t.String()),
            email: t.Optional(t.String()),
          }),
          { minItems: 1, maxItems: 100 },
        ),
        delayMs: t.Optional(
          t.Number({ minimum: 1000, maximum: 10000, default: 2000 }),
        ),
        saveToDb: t.Optional(t.Boolean({ default: true })),
      }),
    },
  )

  /**
   * POST /discovery/report/generate
   * Generate report from list of CPFs
   *
   * Fetches data from database (must be enriched first)
   * Returns Markdown, HTML, or PDF
   */
  .post(
    "/report/generate",
    async ({ body }) => {
      const { cpfs, title, format = "md" } = body;

      apiLogger.info(
        { count: cpfs.length, format, title },
        "Report generation started",
      );

      const result = await container.profileReport.generateFromCpfs(cpfs, {
        title: title || "Relatório de Perfis",
        format,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // For PDF, return file path; for others return content
      if (format === "pdf") {
        return {
          success: true,
          data: {
            format,
            filePath: result.filePath,
            message: "PDF generated successfully",
          },
        };
      }

      return {
        success: true,
        data: {
          format,
          content: result.content,
        },
      };
    },
    {
      body: t.Object({
        cpfs: t.Array(t.String({ minLength: 11, maxLength: 14 }), {
          minItems: 1,
          maxItems: 50,
        }),
        title: t.Optional(t.String()),
        format: t.Optional(
          t.Union([t.Literal("md"), t.Literal("html"), t.Literal("pdf")]),
        ),
      }),
    },
  )

  /**
   * POST /discovery/report/from-names
   * Full pipeline: CPF Discovery → Enrichment → Report
   *
   * Discovers CPFs, enriches via Work API, saves to DB, and generates report
   */
  .post(
    "/report/from-names",
    async ({ body }) => {
      const { names, title, format = "md", saveToDb = true } = body;

      apiLogger.info(
        { count: names.length, format, title },
        "Full report pipeline started",
      );

      // Step 1: CPF Discovery
      apiLogger.info("Step 1: CPF Discovery");
      const cpfResults: Array<{ name: string; cpf: string }> = [];

      for (const name of names) {
        const match = await container.cpfLookup.findBestMatch(name);
        if (match) {
          cpfResults.push({ name, cpf: match.cpf });
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (cpfResults.length === 0) {
        return {
          success: false,
          error: "No CPFs found for the provided names",
        };
      }

      // Step 2: Bulk Enrichment
      apiLogger.info(
        { cpfsFound: cpfResults.length },
        "Step 2: Bulk Enrichment",
      );
      const enrichResult = await container.bulkEnrichment.enrichByCpfs(
        cpfResults.map((r) => r.cpf),
        { saveToDb, delayMs: 2000 },
      );

      // Step 3: Generate Report
      apiLogger.info("Step 3: Generate Report");
      const report = await container.profileReport.generateFromCpfs(
        cpfResults.map((r) => r.cpf),
        { title: title || "Relatório de Perfis", format },
      );

      return {
        success: true,
        data: {
          pipeline: {
            namesProvided: names.length,
            cpfsFound: cpfResults.length,
            completed: enrichResult.completed,
            partial: enrichResult.partial,
            failed: enrichResult.errors,
          },
          cpfMapping: cpfResults,
          report:
            format === "pdf"
              ? { format, filePath: report.filePath }
              : { format, content: report.content },
        },
      };
    },
    {
      body: t.Object({
        names: t.Array(t.String({ minLength: 3 }), {
          minItems: 1,
          maxItems: 20,
        }),
        title: t.Optional(t.String()),
        format: t.Optional(
          t.Union([t.Literal("md"), t.Literal("html"), t.Literal("pdf")]),
        ),
        saveToDb: t.Optional(t.Boolean()),
      }),
    },
  );
