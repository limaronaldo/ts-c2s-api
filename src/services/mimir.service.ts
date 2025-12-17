import { getConfig } from "../config";
import { mimirLogger } from "../utils/logger";
import { normalizePhone } from "../utils/phone";
import { AppError } from "../errors/app-error";

// Mimir API response format (ibvi-mimir v1)
// See: https://ibvi-mimir.ashygrass-6acf749b.brazilsouth.azurecontainerapps.io
export interface MimirResponse {
  status: number;
  data?: {
    total: number;
    pessoas: Array<{
      dados_basicos?: {
        nome?: string;
        cpf?: string;
        data_nascimento?: string;
      };
      emails?: Array<{ email: string }>;
      telefones?: Array<{ telefone: string }>;
      enderecos?: Array<{ cidade?: string; uf?: string }>;
    }>;
  };
  error?: string;
}

/**
 * Mimir API Service (IBVI Azure Container Apps)
 * Uses Bearer token authentication with POST requests
 * Endpoint: /api/v1/search/telefone-simplified
 */
export class MimirService {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor() {
    const config = getConfig();
    this.token = config.MIMIR_TOKEN;
    this.baseUrl = config.MIMIR_URL;
  }

  async findCpfByPhone(phone: string): Promise<string | null> {
    const normalizedPhone = normalizePhone(phone);
    mimirLogger.info(
      { phone: normalizedPhone },
      "Looking up CPF by phone in Mimir",
    );

    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/search/telefone-simplified`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ q: normalizedPhone }),
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          mimirLogger.debug(
            { phone: normalizedPhone },
            "Phone not found in Mimir",
          );
          return null;
        }
        if (response.status === 401) {
          mimirLogger.error(
            { phone: normalizedPhone },
            "Mimir authentication failed",
          );
          throw new Error("Mimir authentication failed");
        }
        throw new Error(`Mimir returned ${response.status}`);
      }

      const data = (await response.json()) as MimirResponse;

      // Check if we have valid data with pessoas array
      if (data.status !== 1 || !data.data?.pessoas?.length) {
        mimirLogger.debug(
          { phone: normalizedPhone, response: data },
          "No results found in Mimir",
        );
        return null;
      }

      // Extract CPF from first person's dados_basicos
      const cpf = data.data.pessoas[0]?.dados_basicos?.cpf;

      if (!cpf) {
        mimirLogger.debug(
          { phone: normalizedPhone },
          "No CPF found in Mimir response",
        );
        return null;
      }

      mimirLogger.info(
        { phone: normalizedPhone, cpf },
        "Found CPF by phone in Mimir",
      );
      return cpf;
    } catch (error) {
      mimirLogger.error(
        { phone: normalizedPhone, error },
        "Failed to lookup phone in Mimir",
      );
      throw AppError.serviceUnavailable("Mimir");
    }
  }
}
