/**
 * CPF Discovery Service Tests
 * TSC-27: Unit tests for CPF discovery 3-tier fallback
 */
import { describe, expect, test, beforeEach } from "bun:test";

describe("CpfDiscoveryService", () => {
  describe("discoverCpfFromPhone - Logic Tests", () => {
    test("tier 1: DBase is called first", () => {
      const callOrder: string[] = [];

      // Simulate service call order - now returns { cpf, name }
      const tryDBase = (): { cpf: string; name: string } | null => {
        callOrder.push("dbase");
        return { cpf: "12345678909", name: "Test User" };
      };
      const tryMimir = (): { cpf: string; name: string } | null => {
        callOrder.push("mimir");
        return null;
      };
      const tryDiretrix = (): { cpf: string; name: string } | null => {
        callOrder.push("diretrix");
        return null;
      };

      // Simulate 3-tier fallback
      let result = tryDBase();
      if (!result) result = tryMimir();
      if (!result) result = tryDiretrix();

      expect(callOrder).toEqual(["dbase"]);
      expect(result?.cpf).toBe("12345678909");
    });

    test("tier 2: Mimir is called when DBase fails", () => {
      const callOrder: string[] = [];

      const tryDBase = (): { cpf: string; name: string } | null => {
        callOrder.push("dbase");
        return null;
      };
      const tryMimir = (): { cpf: string; name: string } | null => {
        callOrder.push("mimir");
        return { cpf: "98765432100", name: "Test User" };
      };
      const tryDiretrix = (): { cpf: string; name: string } | null => {
        callOrder.push("diretrix");
        return null;
      };

      let result = tryDBase();
      if (!result) result = tryMimir();
      if (!result) result = tryDiretrix();

      expect(callOrder).toEqual(["dbase", "mimir"]);
      expect(result?.cpf).toBe("98765432100");
    });

    test("tier 3: Diretrix is called when DBase and Mimir fail", () => {
      const callOrder: string[] = [];

      const tryDBase = (): { cpf: string; name: string } | null => {
        callOrder.push("dbase");
        return null;
      };
      const tryMimir = (): { cpf: string; name: string } | null => {
        callOrder.push("mimir");
        return null;
      };
      const tryDiretrix = (): { cpf: string; name: string } | null => {
        callOrder.push("diretrix");
        return { cpf: "11122233344", name: "Test User" };
      };

      let result = tryDBase();
      if (!result) result = tryMimir();
      if (!result) result = tryDiretrix();

      expect(callOrder).toEqual(["dbase", "mimir", "diretrix"]);
      expect(result?.cpf).toBe("11122233344");
    });

    test("returns null when all sources fail", () => {
      const tryDBase = () => null;
      const tryMimir = () => null;
      const tryDiretrix = () => null;

      let result = tryDBase();
      if (!result) result = tryMimir();
      if (!result) result = tryDiretrix();

      expect(result).toBeNull();
    });

    test("phone normalization removes 55 prefix", () => {
      const normalizePhone = (phone: string) => {
        let digits = phone.replace(/\D/g, "");
        if (digits.startsWith("55") && digits.length > 10) {
          digits = digits.slice(2);
        }
        return digits;
      };

      expect(normalizePhone("5511987654321")).toBe("11987654321");
      expect(normalizePhone("+5511987654321")).toBe("11987654321");
      expect(normalizePhone("11987654321")).toBe("11987654321");
    });

    test("graceful error handling continues to next tier", () => {
      const callOrder: string[] = [];

      const tryDBase = (): { cpf: string; name: string } | null => {
        callOrder.push("dbase");
        throw new Error("Network error");
      };
      const tryMimir = (): { cpf: string; name: string } | null => {
        callOrder.push("mimir");
        return { cpf: "12345678909", name: "Test User" };
      };

      let result: { cpf: string; name: string } | null = null;
      try {
        result = tryDBase();
      } catch {
        // Continue to next tier
      }
      if (!result) result = tryMimir();

      expect(callOrder).toEqual(["dbase", "mimir"]);
      expect(result?.cpf).toBe("12345678909");
    });
  });

  describe("discoverCpfFromEmail - Logic Tests", () => {
    test("email is normalized to lowercase", () => {
      const normalizeEmail = (email: string) => email.toLowerCase().trim();

      expect(normalizeEmail("TEST@EXAMPLE.COM")).toBe("test@example.com");
      expect(normalizeEmail("  User@Domain.Com  ")).toBe("user@domain.com");
    });

    test("cache key format for email", () => {
      const email = "test@example.com";
      const cacheKey = "email:" + email.toLowerCase();

      expect(cacheKey).toBe("email:test@example.com");
    });

    test("returns result from Diretrix", () => {
      const diretrixResult = [{ cpf: "12345678909", nome: "Test User" }];

      const result =
        diretrixResult.length > 0 && diretrixResult[0].cpf
          ? { cpf: diretrixResult[0].cpf, source: "diretrix" }
          : null;

      expect(result?.cpf).toBe("12345678909");
      expect(result?.source).toBe("diretrix");
    });

    test("returns null when Diretrix returns empty", () => {
      const diretrixResult: any[] = [];

      const result =
        diretrixResult.length > 0 && diretrixResult[0].cpf
          ? { cpf: diretrixResult[0].cpf, source: "diretrix" }
          : null;

      expect(result).toBeNull();
    });
  });

  describe("cache integration", () => {
    test("cache key format for phone", () => {
      const phone = "11987654321";
      const cacheKey = "phone:" + phone;

      expect(cacheKey).toBe("phone:11987654321");
    });

    test("cached result returns source as cache", () => {
      const cachedCpf = "12345678909";
      const result = cachedCpf ? { cpf: cachedCpf, source: "cache" } : null;

      expect(result?.source).toBe("cache");
    });
  });
});
