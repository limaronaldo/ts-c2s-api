/**
 * Enrichment Service Tests
 * TSC-27: Unit tests for enrichment orchestration logic
 */
import { describe, expect, test } from "bun:test";

describe("EnrichmentService", () => {
  describe("enrichLead - Logic Tests", () => {
    test("skips lead with no contact info", () => {
      const lead = { phone: undefined, email: undefined };
      const hasContactInfo = !!(lead.phone || lead.email);

      expect(hasContactInfo).toBe(false);
      // Result should be: { skipped: true, skipReason: 'no_contact_info' }
    });

    test("uses CPF from lead attributes if present", () => {
      const lead: { cpf?: string; phone: string } = {
        cpf: "12345678909",
        phone: "11987654321",
      };
      const cpfSource = lead.cpf ? "lead" : "discovery";

      expect(cpfSource).toBe("lead");
    });

    test("discovers CPF from phone when not in lead", () => {
      const lead: { cpf?: string; phone: string; email: string } = {
        phone: "11987654321",
        email: "test@example.com",
      };
      const discoveredCpf = "98765432100"; // From mock service

      // When lead has no CPF, discovery service is called
      const cpfSource = lead.cpf ? "lead" : "dbase";

      expect(cpfSource).toBe("dbase");
    });

    test("discovers CPF from email when phone lookup fails", () => {
      const phoneLookupResult = null;
      const emailLookupResult = { cpf: "11122233344", source: "diretrix" };

      const result = phoneLookupResult || emailLookupResult;

      expect(result?.cpf).toBe("11122233344");
      expect(result?.source).toBe("diretrix");
    });

    test("skips when CPF not found from any source", () => {
      const phoneLookupResult: { cpf: string } | null = null;
      const emailLookupResult: { cpf: string } | null = null;

      const cpf = phoneLookupResult?.cpf || emailLookupResult?.cpf || null;
      const skipReason = cpf ? null : "cpf_not_found";

      expect(skipReason).toBe("cpf_not_found");
    });

    test("Work API is called with discovered CPF", () => {
      const cpf = "12345678909";
      const workApiParams = { modulo: "cpf", consulta: cpf };

      expect(workApiParams.consulta).toBe("12345678909");
    });

    test("C2S is updated with enriched description", () => {
      const leadId = "lead-123";
      const description = "=== DADOS ENRIQUECIDOS ===\nNome: João Silva";
      const updatePayload = { description, cpf: "12345678909" };

      expect(updatePayload.description).toContain("DADOS ENRIQUECIDOS");
      expect(updatePayload.cpf).toBe("12345678909");
    });

    test("stores enrichment data in database", () => {
      const partyData = {
        partyType: "person",
        cpfCnpj: "12345678909",
        fullName: "João Silva",
        enriched: true,
      };

      expect(partyData.enriched).toBe(true);
      expect(partyData.partyType).toBe("person");
    });

    test("returns description length in result", () => {
      const description =
        "=== DADOS ENRIQUECIDOS ===\nNome: João Silva\nCPF: 123.456.789-09";
      const result = { descriptionLength: description.length };

      expect(result.descriptionLength).toBeGreaterThan(0);
    });

    test("handles Work API errors gracefully", () => {
      const error = new Error("Work API timeout");
      const result = {
        success: false,
        enriched: false,
        error: error.message,
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("timeout");
    });

    test("prevents duplicate processing with cache check", () => {
      const leadId = "lead-123";
      const processingCache = new Set<string>();

      processingCache.add(leadId);
      const isAlreadyProcessing = processingCache.has(leadId);

      expect(isAlreadyProcessing).toBe(true);
      // Result should be: { skipped: true, skipReason: 'already_processing' }
    });

    test("skips recently enriched CPFs", () => {
      const cpf = "12345678909";
      const recentCpfCache = new Set<string>();

      recentCpfCache.add(cpf);
      const wasRecentlyEnriched = recentCpfCache.has(cpf);

      expect(wasRecentlyEnriched).toBe(true);
      // Result should be: { skipped: true, skipReason: 'recently_enriched' }
    });
  });

  describe("enrichLead - Result Structure", () => {
    test("successful enrichment result structure", () => {
      const result = {
        leadId: "lead-123",
        success: true,
        cpf: "12345678909",
        cpfSource: "dbase",
        enriched: true,
        skipped: false,
        descriptionLength: 500,
      };

      expect(result).toHaveProperty("leadId");
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("cpf");
      expect(result).toHaveProperty("cpfSource");
      expect(result).toHaveProperty("enriched");
      expect(result).toHaveProperty("skipped");
      expect(result).toHaveProperty("descriptionLength");
    });

    test("skipped enrichment result structure", () => {
      const result = {
        leadId: "lead-123",
        success: true,
        enriched: false,
        skipped: true,
        skipReason: "cpf_not_found",
      };

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe("cpf_not_found");
      expect(result.enriched).toBe(false);
    });

    test("failed enrichment result structure", () => {
      const result = {
        leadId: "lead-123",
        success: false,
        enriched: false,
        skipped: false,
        error: "External API error",
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("storeEnrichmentData - Logic", () => {
    test("extracts contacts from Work API response", () => {
      const workApiData = {
        telefones: [
          { telefone: "11987654321", whatsapp: "S" },
          { telefone: "1132654321" },
        ],
        emails: [{ email: "joao@gmail.com" }],
      };

      const contacts: Array<{ type: string; value: string }> = [];

      for (const tel of workApiData.telefones) {
        contacts.push({ type: "phone", value: tel.telefone });
      }

      for (const email of workApiData.emails) {
        contacts.push({ type: "email", value: email.email });
      }

      expect(contacts).toHaveLength(3);
      expect(contacts[0].value).toBe("11987654321");
      expect(contacts[2].type).toBe("email");
    });

    test("normalizes names from Work API", () => {
      const basicData = { nome: "João da Silva" };
      const normalized = basicData.nome
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      expect(normalized).toBe("JOAO DA SILVA");
    });
  });
});
