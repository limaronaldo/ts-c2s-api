import { describe, expect, test } from "bun:test";
import {
  formatInsightMessage,
  createFamilyConnectionInsight,
  createRareSurnameInsight,
  createNotableFamilyInsight,
  createHighIncomeInsight,
  createInternationalInsight,
  createMultiplePropertiesInsight,
  createConcatenatedNameInsight,
  type LeadInsight,
  type InsightContext,
} from "../../src/utils/insight-formatter";

describe("insight-formatter", () => {
  describe("createFamilyConnectionInsight", () => {
    test("creates family connection insight", () => {
      const insight = createFamilyConnectionInsight(
        "Luiz Godinho",
        "Adriana Godinho",
        "Provável cônjuge",
        "godinho",
      );

      expect(insight.type).toBe("family_connection");
      expect(insight.confidence).toBe(85);
      expect(insight.title).toContain("Familiar");
      expect(insight.details).toContain("Lead: Luiz Godinho");
      expect(insight.details).toContain("CPF encontrado: Adriana Godinho");
    });
  });

  describe("createNotableFamilyInsight", () => {
    test("creates notable family insight", () => {
      const insight = createNotableFamilyInsight(
        "rudge",
        "Família bancária tradicional",
        ["José Rudge", "Lala Rudge"],
      );

      expect(insight.type).toBe("notable_family");
      expect(insight.confidence).toBe(95);
      expect(insight.title).toContain("Rudge");
      expect(insight.recommendation).toContain("PRIORITÁRIO");
    });
  });

  describe("createHighIncomeInsight", () => {
    test("creates high income insight", () => {
      const insight = createHighIncomeInsight(25000, 30000);

      expect(insight.type).toBe("high_income");
      expect(insight.confidence).toBe(95);
      expect(insight.details[0]).toContain("R$");
      expect(insight.details[0]).toContain("25.000");
    });

    test("includes tier for ultra-high income", () => {
      const insight = createHighIncomeInsight(60000);
      expect(insight.details.some((d) => d.includes("Ultra-alto"))).toBe(true);
    });
  });

  describe("createRareSurnameInsight", () => {
    test("creates rare surname insight", () => {
      const insight = createRareSurnameInsight("Passafaro");

      expect(insight.type).toBe("rare_surname");
      expect(insight.title).toContain("Incomum");
      expect(insight.details[0]).toContain("Passafaro");
    });

    test("includes context if provided", () => {
      const insight = createRareSurnameInsight("Falabella", "Origem italiana");

      expect(insight.details).toContain("Origem italiana");
    });
  });

  describe("createInternationalInsight", () => {
    test("creates international insight", () => {
      const insight = createInternationalInsight(
        "África do Sul",
        "+27123456789",
      );

      expect(insight.type).toBe("international");
      expect(insight.title).toContain("Internacional");
      expect(insight.title).toContain("África do Sul");
    });
  });

  describe("createMultiplePropertiesInsight", () => {
    test("creates multiple properties insight", () => {
      const insight = createMultiplePropertiesInsight(7, [
        "São Paulo",
        "Rio de Janeiro",
      ]);

      expect(insight.type).toBe("multiple_properties");
      expect(insight.details[0]).toContain("7 imóveis");
      expect(insight.recommendation).toContain("Investidor");
    });
  });

  describe("createConcatenatedNameInsight", () => {
    test("creates concatenated name insight", () => {
      const insight = createConcatenatedNameInsight(
        "Martarabello",
        "Marta",
        "Rabello",
      );

      expect(insight.type).toBe("concatenated_name");
      expect(insight.details).toContain("Nome recebido: Martarabello");
      expect(insight.details).toContain("Interpretação: Marta Rabello");
    });
  });

  describe("formatInsightMessage", () => {
    test("formats multiple insights into message", () => {
      const insights: LeadInsight[] = [
        createHighIncomeInsight(20000),
        createRareSurnameInsight("Falabella"),
      ];

      const context: InsightContext = {
        leadName: "João Falabella",
        income: 20000,
        tier: "gold",
      };

      const message = formatInsightMessage(insights, context);

      // Removido: INSIGHT AUTOMÁTICO, Perfil Descoberto, Confiança, Indicadores, Recomendação
      expect(message).not.toContain("INSIGHT AUTOMÁTICO");
      expect(message).not.toContain("Perfil Descoberto");
      expect(message).not.toContain("Indicadores");
      // Deve conter o disclaimer
      expect(message).toContain("Análise Experimental");
    });

    test("includes tier classification for notable family", () => {
      const insights: LeadInsight[] = [
        createNotableFamilyInsight("Safra", "Família bancária", [
          "Banco Safra",
        ]),
      ];

      const context: InsightContext = {
        leadName: "Test Safra",
        income: 50000,
      };

      const message = formatInsightMessage(insights, context);

      expect(message).toContain("PLATINUM");
      expect(message).toContain("Família de alto perfil");
      expect(message).toContain("Análise Experimental");
    });

    test("returns empty string for no insights", () => {
      const message = formatInsightMessage([], { leadName: "Test" });
      expect(message).toBe("");
    });

    test("includes property count when multiple properties", () => {
      const insights: LeadInsight[] = [createHighIncomeInsight(15000)];

      const context: InsightContext = {
        leadName: "Test User",
        propertyCount: 5,
      };

      const message = formatInsightMessage(insights, context);

      expect(message).toContain("5 imóveis registrados");
    });

    test("does not include confidence percentage (removed)", () => {
      const insights: LeadInsight[] = [
        { type: "high_income", confidence: 90, title: "Test", details: [] },
        { type: "rare_surname", confidence: 70, title: "Test", details: [] },
      ];

      const context: InsightContext = { leadName: "Test" };
      const message = formatInsightMessage(insights, context);

      // Confiança foi removida da mensagem por request
      expect(message).not.toContain("Confiança");
      expect(message).not.toContain("80%");
    });
  });
});
