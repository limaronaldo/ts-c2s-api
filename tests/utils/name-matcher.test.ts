/**
 * Name Matcher Utility Tests
 * RML-595: Smart name matching for CPF lookups
 */
import { describe, expect, test } from "bun:test";
import {
  normalizeName,
  calculateSimilarity,
  matchNames,
  findBestMatch,
} from "../../src/utils/name-matcher";

describe("Name Matcher Utility", () => {
  describe("normalizeName", () => {
    test("converts to uppercase", () => {
      expect(normalizeName("João Silva")).toBe("JOAO SILVA");
    });

    test("removes accents", () => {
      expect(normalizeName("José María Conceição")).toBe(
        "JOSE MARIA CONCEICAO",
      );
    });

    test("expands common abbreviations", () => {
      expect(normalizeName("M. Silva")).toBe("MARIA SILVA");
      expect(normalizeName("J. Santos")).toBe("JOSE SANTOS");
    });

    test("removes common suffixes", () => {
      expect(normalizeName("João Silva Junior")).toBe("JOAO SILVA");
      expect(normalizeName("Maria Santos Filho")).toBe("MARIA SANTOS");
      expect(normalizeName("Pedro Oliveira Neto")).toBe("PEDRO OLIVEIRA");
    });

    test("handles empty strings", () => {
      expect(normalizeName("")).toBe("");
      expect(normalizeName("   ")).toBe("");
    });

    test("normalizes whitespace", () => {
      expect(normalizeName("  João   da   Silva  ")).toBe("JOAO DA SILVA");
    });
  });

  describe("calculateSimilarity", () => {
    test("returns 1 for identical strings", () => {
      expect(calculateSimilarity("JOAO SILVA", "JOAO SILVA")).toBe(1);
    });

    test("returns 0 for empty strings", () => {
      expect(calculateSimilarity("", "JOAO")).toBe(0);
      expect(calculateSimilarity("JOAO", "")).toBe(0);
    });

    test("returns high similarity for similar names", () => {
      const similarity = calculateSimilarity("JOAO SILVA", "JOAO SILVAA");
      expect(similarity).toBeGreaterThan(0.9);
    });

    test("returns low similarity for different names", () => {
      const similarity = calculateSimilarity("JOAO SILVA", "MARIA SANTOS");
      expect(similarity).toBeLessThan(0.5);
    });
  });

  describe("matchNames", () => {
    test("matches identical names after normalization", () => {
      const result = matchNames("João Silva", "JOAO SILVA");
      expect(result.matches).toBe(true);
      expect(result.score).toBe(1);
      expect(result.method).toBe("exact");
    });

    test("matches names with minor variations", () => {
      const result = matchNames("Maria Silva", "MARIA SILVAA");
      expect(result.matches).toBe(true);
      expect(result.method).toBe("fuzzy-full");
    });

    test("matches names with abbreviations", () => {
      const result = matchNames("M. Silva", "Maria Silva");
      expect(result.matches).toBe(true);
    });

    test("matches names with suffix differences", () => {
      const result = matchNames("João Silva Junior", "João Silva");
      expect(result.matches).toBe(true);
    });

    test("rejects clearly different names", () => {
      const result = matchNames("João Silva", "Pedro Santos");
      expect(result.matches).toBe(false);
    });

    test("matches when first names match exactly", () => {
      // Maria Silveira vs Maria Silva - similar enough to match via fuzzy-full
      const result = matchNames("Maria Silveira", "Maria Silva");
      expect(result.matches).toBe(true);
      // fuzzy-full takes precedence when overall similarity is >= 0.75
      expect(result.method).toBe("fuzzy-full");
    });

    test("matches when last names match exactly", () => {
      // Joao Silva vs Jose Silva - same last name, similar first (matches via fuzzy-full)
      const result = matchNames("João Silva", "Jose Silva");
      expect(result.matches).toBe(true);
      // Note: matches via fuzzy-full because overall similarity is high enough
      expect(result.method).toBe("fuzzy-full");
    });

    test("respects custom threshold for fuzzy matching", () => {
      // With strict threshold on very different names, no match
      const strict = matchNames("João Silva", "Pedro Santos", 0.95);
      expect(strict.matches).toBe(false);

      // With relaxed threshold on similar names, they match
      const relaxed = matchNames("João Silva", "Joao Silvaa", 0.7);
      expect(relaxed.matches).toBe(true);
    });
  });

  describe("findBestMatch", () => {
    test("finds best matching candidate", () => {
      const candidates = [
        { name: "PEDRO SANTOS", cpf: "11111111111" },
        { name: "JOAO SILVA", cpf: "22222222222" },
        { name: "MARIA OLIVEIRA", cpf: "33333333333" },
      ];

      const result = findBestMatch("João Silva", candidates);
      expect(result).not.toBeNull();
      expect(result?.cpf).toBe("22222222222");
      expect(result?.score).toBe(1);
    });

    test("returns null when no match found", () => {
      const candidates = [
        { name: "PEDRO SANTOS", cpf: "11111111111" },
        { name: "CARLOS OLIVEIRA", cpf: "22222222222" },
      ];

      const result = findBestMatch("João Silva", candidates);
      expect(result).toBeNull();
    });

    test("returns null for empty candidates", () => {
      const result = findBestMatch("João Silva", []);
      expect(result).toBeNull();
    });

    test("returns null for empty lead name", () => {
      const candidates = [{ name: "JOAO SILVA", cpf: "11111111111" }];
      const result = findBestMatch("", candidates);
      expect(result).toBeNull();
    });

    test("picks highest scoring match from multiple candidates", () => {
      const candidates = [
        { name: "JOAO SILVEIRA", cpf: "11111111111" }, // Similar but not exact
        { name: "JOAO SILVA", cpf: "22222222222" }, // Exact match
        { name: "JOAO SILVANO", cpf: "33333333333" }, // Similar but not exact
      ];

      const result = findBestMatch("João Silva", candidates);
      expect(result?.cpf).toBe("22222222222");
    });
  });

  describe("Real-world scenarios", () => {
    test("handles lead 'SIMONE' matching 'SIMONE SANTOS SILVA'", () => {
      const result = matchNames("SIMONE", "SIMONE SANTOS SILVA");
      expect(result.matches).toBe(true);
    });

    test("handles lead 'Maria S' matching 'MARIA SILVA'", () => {
      // Maria S is contained in MARIA SILVA
      const result = matchNames("Maria S", "MARIA SILVA");
      expect(result.matches).toBe(true);
      expect(result.method).toBe("contains");
    });

    test("rejects phone owner mismatch (different person)", () => {
      const result = matchNames("João Santos", "Maria Oliveira");
      expect(result.matches).toBe(false);
    });

    test("handles name with middle names removed", () => {
      const result = matchNames("José Maria Santos", "JOSE SANTOS");
      expect(result.matches).toBe(true);
    });
  });
});
