import { describe, expect, test } from "bun:test";
import {
  normalizeIncome,
  normalizeCpf,
  isValidCpf,
  formatCpf,
  normalizeName,
  normalizeEmail,
} from "../../src/utils/normalize";

describe("normalizeIncome", () => {
  test("applies 1.9x multiplier by default", () => {
    expect(normalizeIncome(1000)).toBe(1900);
    expect(normalizeIncome(5000)).toBe(9500);
  });

  test("handles string input with currency formatting", () => {
    expect(normalizeIncome("R$ 1.000,00")).toBe(1900);
    expect(normalizeIncome("5.000,50")).toBe(9500.95);
  });

  test("allows custom multiplier", () => {
    expect(normalizeIncome(1000, 2.0)).toBe(2000);
    expect(normalizeIncome(1000, 1.5)).toBe(1500);
  });

  test("returns null for invalid input", () => {
    expect(normalizeIncome(null)).toBeNull();
    expect(normalizeIncome(undefined)).toBeNull();
    expect(normalizeIncome("")).toBeNull();
    expect(normalizeIncome("abc")).toBeNull();
    expect(normalizeIncome(0)).toBeNull();
    expect(normalizeIncome(-100)).toBeNull();
  });
});

describe("normalizeCpf", () => {
  test("removes non-digit characters", () => {
    expect(normalizeCpf("123.456.789-09")).toBe("12345678909");
    expect(normalizeCpf("123 456 789 09")).toBe("12345678909");
  });

  test("pads with leading zeros", () => {
    expect(normalizeCpf("1234567890")).toBe("01234567890");
    expect(normalizeCpf("123456789")).toBe("00123456789");
  });
});

describe("isValidCpf", () => {
  test("validates correct CPFs", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("529.982.247-25")).toBe(true);
  });

  test("rejects invalid CPFs", () => {
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("12345678901")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });
});

describe("formatCpf", () => {
  test("formats CPF with mask", () => {
    expect(formatCpf("12345678909")).toBe("123.456.789-09");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });
});

describe("normalizeName", () => {
  test("capitalizes words", () => {
    expect(normalizeName("john doe")).toBe("John Doe");
    expect(normalizeName("MARIA SILVA")).toBe("Maria Silva");
  });

  test("removes extra spaces", () => {
    expect(normalizeName("john  doe")).toBe("John Doe");
    expect(normalizeName("  john doe  ")).toBe("John Doe");
  });

  test("returns null for empty input", () => {
    expect(normalizeName(null)).toBeNull();
    expect(normalizeName(undefined)).toBeNull();
    expect(normalizeName("")).toBeNull();
  });
});

describe("normalizeEmail", () => {
  test("lowercases and trims email", () => {
    expect(normalizeEmail("John@Example.COM")).toBe("john@example.com");
    expect(normalizeEmail("  user@test.com  ")).toBe("user@test.com");
  });

  test("returns null for empty input", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });
});
