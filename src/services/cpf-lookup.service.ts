import { enrichmentLogger } from "../utils/logger";

/**
 * CPF record from the cpf-lookup-api
 */
export interface CpfLookupRecord {
  cpf: string;
  nome_completo: string;
  sexo: string | null;
  data_nascimento: string | null;
}

/**
 * Service for cpf-lookup-api.fly.dev
 * Database: DuckDB with 223M+ CPF records
 *
 * Endpoints:
 * - GET /cpf/:cpf - Lookup by CPF (fast, indexed)
 * - GET /search/:name - Search by name (slow, full scan)
 * - GET /masked/:masked - Lookup by masked CPF (6 middle digits)
 * - GET /health - Health check
 * - GET /stats - Database stats
 */
export class CpfLookupService {
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.baseUrl =
      process.env.CPF_LOOKUP_API_URL || "https://cpf-lookup-api.fly.dev";
    this.timeout = 10000; // 10 seconds
  }

  /**
   * Lookup CPF by number - validates and returns full record
   * Fast: Uses indexed lookup on CPF column
   */
  async lookupByCpf(cpf: string): Promise<CpfLookupRecord | null> {
    const cleanCpf = cpf.replace(/\D/g, "");

    if (cleanCpf.length !== 11) {
      enrichmentLogger.warn({ cpf }, "Invalid CPF length for lookup");
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/cpf/${cleanCpf}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        if (response.status === 404) {
          enrichmentLogger.debug({ cpf: cleanCpf }, "CPF not found in lookup");
          return null;
        }
        enrichmentLogger.warn(
          { cpf: cleanCpf, status: response.status },
          "CPF lookup API error",
        );
        return null;
      }

      const record: CpfLookupRecord = await response.json();

      enrichmentLogger.info(
        {
          cpf: cleanCpf,
          nome: record.nome_completo,
          sexo: record.sexo,
        },
        "CPF validated via cpf-lookup-api",
      );

      return record;
    } catch (error) {
      enrichmentLogger.warn(
        { cpf: cleanCpf, error: String(error) },
        "CPF lookup API request failed",
      );
      return null;
    }
  }

  /**
   * Lookup by masked CPF (e.g., ***.123.456-**)
   * Returns multiple matches based on 6 middle digits
   */
  async lookupByMasked(
    maskedCpf: string,
  ): Promise<{ count: number; results: CpfLookupRecord[] } | null> {
    const digits = maskedCpf.replace(/\D/g, "");

    if (digits.length < 6) {
      enrichmentLogger.warn(
        { maskedCpf },
        "Need at least 6 digits for masked lookup",
      );
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/masked/${maskedCpf}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        enrichmentLogger.warn(
          { maskedCpf, status: response.status },
          "Masked CPF lookup failed",
        );
        return null;
      }

      const result = await response.json();

      enrichmentLogger.info(
        { maskedCpf, count: result.count },
        "Masked CPF lookup completed",
      );

      return result;
    } catch (error) {
      enrichmentLogger.warn(
        { maskedCpf, error: String(error) },
        "Masked CPF lookup request failed",
      );
      return null;
    }
  }

  /**
   * Validate CPF and get real name
   * Useful after discovering a CPF to confirm it's valid
   */
  async validateCpf(
    cpf: string,
  ): Promise<{ valid: boolean; name?: string; record?: CpfLookupRecord }> {
    const record = await this.lookupByCpf(cpf);

    if (!record) {
      return { valid: false };
    }

    return {
      valid: true,
      name: record.nome_completo,
      record,
    };
  }

  /**
   * Check API health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get database stats
   */
  async getStats(): Promise<{ database: string; total_records: number } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/stats`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
}
