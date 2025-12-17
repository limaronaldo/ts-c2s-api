import { getConfig } from "../config";
import { workApiLogger } from "../utils/logger";
import { workApiCache } from "../utils/cache";
import { AppError } from "../errors/app-error";
import { withRetry, isRetryableError } from "../utils/retry";

export interface WorkApiPerson {
  cpf: string;
  nome: string;
  dataNascimento?: string;
  sexo?: string;
  nomeMae?: string;
  renda?: number;
  rendaPresumida?: number;
  patrimonio?: number;
  escolaridade?: string;
  estadoCivil?: string;
  profissao?: string;
  telefones?: Array<{
    numero: string;
    tipo?: string;
  }>;
  emails?: Array<{
    email: string;
  }>;
  enderecos?: Array<{
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
  }>;
}

export interface WorkApiResponse {
  success: boolean;
  data?: WorkApiPerson;
  error?: string;
}

/**
 * Result of a Work API fetch operation
 * Includes timeout status for partial enrichment handling
 */
export interface WorkApiFetchResult {
  data: WorkApiPerson | null;
  timedOut: boolean;
  error?: string;
}

/**
 * Work API Service
 *
 * Timeout Handling: 15-second timeout with graceful fallback
 * Reference: Lead Operations Guide - "15-second timeout for Work API with partial fallback"
 */
export class WorkApiService {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  // Timeout configuration - prevents hanging requests
  private readonly TIMEOUT_MS = 15000; // 15 seconds

  constructor() {
    const config = getConfig();
    this.apiKey = config.WORK_API;
    this.baseUrl = config.WORK_API_URL;
  }

  /**
   * Fetch person data by CPF with timeout handling
   * Returns null on timeout but doesn't throw - allows partial enrichment
   */
  async fetchByCpf(cpf: string): Promise<WorkApiPerson | null> {
    const result = await this.fetchByCpfWithTimeout(cpf);
    return result.data;
  }

  /**
   * Fetch person data by CPF with detailed result including timeout status
   * Use this when you need to know if enrichment was partial due to timeout
   */
  async fetchByCpfWithTimeout(cpf: string): Promise<WorkApiFetchResult> {
    const cacheKey = `cpf:${cpf}`;
    const cached = workApiCache.get(cacheKey) as WorkApiPerson | undefined;
    if (cached) {
      workApiLogger.debug({ cpf }, "Cache hit for Work API");
      return { data: cached, timedOut: false };
    }

    workApiLogger.info({ cpf }, "Fetching from Work API");

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.TIMEOUT_MS);

    try {
      // Use retry logic with exponential backoff for transient failures
      // Reference: Lead Operations Guide - "3 retries max, exponential backoff: 1s, 2s, 4s"
      // Work API uses query parameters: ?token={token}&modulo=cpf&consulta={cpf}
      const url = `${this.baseUrl}?token=${this.apiKey}&modulo=cpf&consulta=${cpf}`;
      const response = await withRetry(
        async () => {
          const res = await fetch(url, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
            signal: controller.signal,
          });

          // Don't retry on 404 - that's a valid "not found" response
          if (!res.ok && res.status !== 404) {
            throw new Error(`Work API returned ${res.status}`);
          }

          return res;
        },
        {
          maxRetries: 3,
          baseDelayMs: 1000,
          shouldRetry: (error) => {
            // Don't retry on abort/timeout - we handle that separately
            if (error instanceof Error && error.name === "AbortError") {
              return false;
            }
            return isRetryableError(error);
          },
          onRetry: (error, attempt, delayMs) => {
            workApiLogger.warn(
              {
                cpf,
                attempt,
                delayMs,
                error: error instanceof Error ? error.message : String(error),
              },
              "Retrying Work API request",
            );
          },
        },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          workApiLogger.debug({ cpf }, "Person not found in Work API");
          return { data: null, timedOut: false };
        }
        throw new Error(`Work API returned ${response.status}`);
      }

      const rawData = await response.json();

      // Work API returns data directly with DadosBasicos, not wrapped in success/data
      // Check for error response
      if (rawData.erro) {
        workApiLogger.debug(
          { cpf, error: rawData.erro },
          "Work API returned error",
        );
        return { data: null, timedOut: false };
      }

      if (!rawData.DadosBasicos) {
        workApiLogger.debug({ cpf }, "Work API returned no data");
        return { data: null, timedOut: false };
      }

      // Transform Work API response to our internal format
      const person: WorkApiPerson = {
        cpf,
        nome: rawData.DadosBasicos.nome || "",
        dataNascimento: rawData.DadosBasicos.dataNascimento,
        sexo: rawData.DadosBasicos.sexo,
        nomeMae: rawData.DadosBasicos.nomeMae,
        renda: rawData.DadosEconomicos?.renda
          ? parseFloat(String(rawData.DadosEconomicos.renda).replace(",", "."))
          : undefined,
        rendaPresumida: rawData.DadosEconomicos?.rendaPresumida
          ? parseFloat(
              String(rawData.DadosEconomicos.rendaPresumida).replace(",", "."),
            )
          : undefined,
        telefones: rawData.telefones?.map(
          (t: { telefone: string; tipo?: string }) => ({
            numero: t.telefone,
            tipo: t.tipo,
          }),
        ),
        emails: rawData.emails?.map((e: { email: string }) => ({
          email: e.email,
        })),
        enderecos: rawData.enderecos?.map(
          (a: {
            logradouro?: string;
            numero?: string;
            complemento?: string;
            bairro?: string;
            cidade?: string;
            uf?: string;
            cep?: string;
          }) => ({
            logradouro: a.logradouro,
            numero: a.numero,
            complemento: a.complemento,
            bairro: a.bairro,
            cidade: a.cidade,
            uf: a.uf,
            cep: a.cep,
          }),
        ),
      };

      workApiCache.set(cacheKey, person);
      workApiLogger.info(
        { cpf, name: person.nome },
        "Successfully fetched from Work API",
      );

      return { data: person, timedOut: false };
    } catch (error) {
      clearTimeout(timeoutId);

      // Check if this was a timeout (abort)
      if (error instanceof Error && error.name === "AbortError") {
        workApiLogger.warn(
          { cpf, timeoutMs: this.TIMEOUT_MS },
          "Work API request timed out - proceeding with partial enrichment",
        );
        return { data: null, timedOut: true, error: "Request timed out" };
      }

      // Treat connection errors as timeout - allow partial enrichment to proceed
      // This handles cases where Work API is down or IP blocked
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = (error as { code?: string })?.code;

      if (
        errorCode === "ConnectionRefused" ||
        errorCode === "ECONNREFUSED" ||
        errorMessage.includes("ConnectionRefused") ||
        errorMessage.includes("ECONNREFUSED")
      ) {
        workApiLogger.warn(
          { cpf, error: errorMessage },
          "Work API connection refused - proceeding with partial enrichment",
        );
        return { data: null, timedOut: true, error: "Connection refused" };
      }

      workApiLogger.error(
        { cpf, error },
        "Failed to fetch from Work API after retries",
      );
      throw AppError.serviceUnavailable("Work API");
    }
  }
}
