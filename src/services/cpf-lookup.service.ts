/**
 * CPF Lookup Service - Busca CPF por nome usando DuckDB API (223M registros)
 *
 * Este serviço permite descobrir CPFs a partir do nome completo da pessoa,
 * utilizando a API cpf-lookup-api hospedada no Fly.io.
 *
 * Auto-scaling: Automatically scales the Fly.io machine up to 8GB RAM
 * before searches and schedules scale-down after 5 minutes of inactivity.
 */

import { getConfig } from "../config";
import { FlyScaleService } from "./fly-scale.service";

// Logger inline para evitar dependência circular
const log = (level: string, msg: string, data?: Record<string, unknown>) => {
  console.log(
    JSON.stringify({
      level,
      module: "cpf-lookup",
      msg,
      ...data,
      timestamp: new Date().toISOString(),
    }),
  );
};

export interface CpfLookupResult {
  cpf: string;
  nome_completo: string;
  sexo?: string;
  data_nascimento?: string;
}

export interface CpfLookupResponse {
  count: number;
  results: CpfLookupResult[];
}

export interface CpfSearchResult {
  success: boolean;
  count: number;
  results: CpfLookupResult[];
  error?: string;
}

export class CpfLookupService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly flyScale: FlyScaleService;

  constructor() {
    const config = getConfig();
    this.baseUrl = config.CPF_LOOKUP_API_URL;
    this.timeoutMs = config.CPF_LOOKUP_TIMEOUT_MS;
    this.flyScale = new FlyScaleService();
  }

  /**
   * Ensure machine is scaled up before heavy operations
   */
  private async ensureScaledUp(): Promise<void> {
    if (this.flyScale.isEnabled()) {
      log("info", "Auto-scaling up before search");
      const success = await this.flyScale.scaleUp();
      if (success) {
        // Wait a bit for the machine to be fully ready
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  /**
   * Schedule scale-down after operation completes
   */
  private scheduleScaleDown(): void {
    this.flyScale.scheduleScaleDown();
  }

  /**
   * Verifica se a API está online
   */
  async healthCheck(): Promise<{
    ok: boolean;
    database?: string;
    total_records?: number;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return { ok: false };
      }

      // Buscar stats também
      const statsResponse = await fetch(`${this.baseUrl}/stats`, {
        signal: AbortSignal.timeout(5000),
      });

      if (statsResponse.ok) {
        const stats = await statsResponse.json();
        return {
          ok: true,
          database: stats.database,
          total_records: stats.total_records,
        };
      }

      return { ok: true };
    } catch (error) {
      log("error", "Health check failed", { error: String(error) });
      return { ok: false };
    }
  }

  /**
   * Busca CPF por nome completo
   * ATENÇÃO: Pode ser lento (full scan em 223M registros)
   * Auto-scales the machine up before search and schedules scale-down after.
   */
  async searchByName(name: string): Promise<CpfSearchResult> {
    const normalizedName = name.trim().toUpperCase();

    log("info", "Searching CPF by name", { name: normalizedName });

    try {
      // Auto-scale up before heavy search operation
      await this.ensureScaledUp();

      const url = `${this.baseUrl}/search/${encodeURIComponent(normalizedName)}`;

      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      // Schedule scale-down after search completes
      this.scheduleScaleDown();

      if (!response.ok) {
        log("warn", "Search returned non-OK status", {
          status: response.status,
        });
        return {
          success: false,
          count: 0,
          results: [],
          error: `HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as CpfLookupResponse;

      log("info", "Search completed", {
        name: normalizedName,
        count: data.count,
      });

      return {
        success: true,
        count: data.count || 0,
        results: data.results || [],
      };
    } catch (error) {
      // Still schedule scale-down on error
      this.scheduleScaleDown();

      const errorMsg = error instanceof Error ? error.message : String(error);

      if (errorMsg.includes("timeout") || errorMsg.includes("aborted")) {
        log("warn", "Search timed out", {
          name: normalizedName,
          timeoutMs: this.timeoutMs,
        });
        return {
          success: false,
          count: 0,
          results: [],
          error: "Timeout - busca por nome pode demorar com 4GB de RAM",
        };
      }

      log("error", "Search failed", { name: normalizedName, error: errorMsg });
      return {
        success: false,
        count: 0,
        results: [],
        error: errorMsg,
      };
    }
  }

  /**
   * Busca dados por CPF conhecido
   */
  async getByCpf(cpf: string): Promise<CpfLookupResult | null> {
    const normalizedCpf = cpf.replace(/\D/g, "");

    log("info", "Looking up CPF", {
      cpf: normalizedCpf.substring(0, 3) + "***",
    });

    try {
      const url = `${this.baseUrl}/cpf/${normalizedCpf}`;

      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        if (response.status === 404) {
          log("info", "CPF not found in database");
          return null;
        }
        log("warn", "Lookup returned non-OK status", {
          status: response.status,
        });
        return null;
      }

      const data = (await response.json()) as CpfLookupResult;
      log("info", "CPF found", {
        nome: data.nome_completo?.substring(0, 20) + "...",
      });

      return data;
    } catch (error) {
      log("error", "CPF lookup failed", { error: String(error) });
      return null;
    }
  }

  /**
   * Busca múltiplos CPFs por lista de nomes
   * Processa em série para evitar sobrecarga da API
   */
  async searchMultipleByName(
    names: string[],
    options: {
      delayMs?: number;
      onProgress?: (
        current: number,
        total: number,
        result: CpfSearchResult,
      ) => void;
    } = {},
  ): Promise<Map<string, CpfSearchResult>> {
    const { delayMs = 1000, onProgress } = options;
    const results = new Map<string, CpfSearchResult>();

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const result = await this.searchByName(name);
      results.set(name, result);

      if (onProgress) {
        onProgress(i + 1, names.length, result);
      }

      // Delay entre requests para não sobrecarregar
      if (i < names.length - 1 && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  /**
   * Encontra o melhor match de CPF para um nome
   * Retorna o primeiro resultado se houver match exato, ou null
   */
  async findBestMatch(name: string): Promise<CpfLookupResult | null> {
    const result = await this.searchByName(name);

    if (!result.success || result.count === 0) {
      return null;
    }

    // Se tem apenas 1 resultado, retorna ele
    if (result.count === 1) {
      return result.results[0];
    }

    // Se tem múltiplos, tenta encontrar match exato do nome
    const normalizedName = name.trim().toUpperCase();
    const exactMatch = result.results.find(
      (r) => r.nome_completo.toUpperCase() === normalizedName,
    );

    if (exactMatch) {
      return exactMatch;
    }

    // Retorna o primeiro resultado como fallback
    log("warn", "Multiple results, returning first", {
      name,
      count: result.count,
    });
    return result.results[0];
  }

  /**
   * Alias para getByCpf - compatibilidade com cpf-discovery.service.ts
   */
  async lookupByCpf(cpf: string): Promise<CpfLookupResult | null> {
    return this.getByCpf(cpf);
  }

  /**
   * Busca CPF por formato mascarado (ex: ***.123.456-**)
   * Extrai os 6 dígitos do meio e busca por padrão
   */
  async lookupByMasked(
    maskedCpf: string,
  ): Promise<{ count: number; results: CpfLookupResult[] } | null> {
    // Extrai os dígitos visíveis do CPF mascarado
    // Formato esperado: ***.XXX.XXX-** onde XXX.XXX são os 6 dígitos do meio
    const digits = maskedCpf.replace(/\D/g, "");

    if (digits.length < 6) {
      log("warn", "Masked CPF has insufficient digits", { maskedCpf, digits });
      return null;
    }

    log("info", "Looking up masked CPF", { maskedCpf, digits });

    try {
      const url = `${this.baseUrl}/masked/${encodeURIComponent(digits)}`;

      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        if (response.status === 404) {
          log("info", "No CPFs found for masked pattern");
          return { count: 0, results: [] };
        }
        log("warn", "Masked lookup returned non-OK status", {
          status: response.status,
        });
        return null;
      }

      const data = (await response.json()) as CpfLookupResponse;
      log("info", "Masked lookup completed", {
        maskedCpf,
        count: data.count,
      });

      return {
        count: data.count || 0,
        results: data.results || [],
      };
    } catch (error) {
      log("error", "Masked CPF lookup failed", { error: String(error) });
      return null;
    }
  }
}
