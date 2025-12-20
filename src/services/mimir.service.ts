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

  async findCpfByPhone(
    phone: string,
  ): Promise<{ cpf: string; name: string } | null> {
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

      const responseText = await response.text();

      if (!response.ok) {
        mimirLogger.warn(
          {
            phone: normalizedPhone,
            status: response.status,
            error: responseText,
          },
          "Mimir returned error status",
        );
        if (response.status === 404) {
          return null;
        }
        if (response.status === 401) {
          throw new Error("Mimir authentication failed");
        }
        throw new Error(`Mimir returned ${response.status}: ${responseText}`);
      }

      const data = JSON.parse(responseText) as MimirResponse;

      // Check if we have valid data with pessoas array
      if (data.status !== 1 || !data.data?.pessoas?.length) {
        mimirLogger.debug(
          { phone: normalizedPhone, response: data },
          "No results found in Mimir",
        );
        return null;
      }

      // Extract CPF and name from first person's dados_basicos
      const pessoa = data.data.pessoas[0];
      const cpf = pessoa?.dados_basicos?.cpf;
      const name = pessoa?.dados_basicos?.nome || "";

      if (!cpf) {
        mimirLogger.debug(
          { phone: normalizedPhone },
          "No CPF found in Mimir response",
        );
        return null;
      }

      mimirLogger.info(
        { phone: normalizedPhone, cpf, name },
        "Found CPF by phone in Mimir",
      );
      return { cpf, name };
    } catch (error) {
      mimirLogger.error(
        { phone: normalizedPhone, error },
        "Failed to lookup phone in Mimir",
      );
      throw AppError.serviceUnavailable("Mimir");
    }
  }

  async findCpfByEmail(
    email: string,
  ): Promise<{ cpf: string; name: string } | null> {
    mimirLogger.info({ email }, "Looking up CPF by email in Mimir");

    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/search/email-simplified`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ q: email.toLowerCase().trim() }),
        },
      );

      const responseText = await response.text();

      if (!response.ok) {
        mimirLogger.warn(
          { email, status: response.status, error: responseText },
          "Mimir returned error status",
        );
        if (response.status === 404) {
          return null;
        }
        if (response.status === 401) {
          throw new Error("Mimir authentication failed");
        }
        throw new Error(`Mimir returned ${response.status}: ${responseText}`);
      }

      const data = JSON.parse(responseText) as MimirResponse;

      // Check if we have valid data with pessoas array
      if (data.status !== 1 || !data.data?.pessoas?.length) {
        mimirLogger.debug({ email }, "No results found in Mimir");
        return null;
      }

      // Extract CPF and name from first person's dados_basicos
      const pessoa = data.data.pessoas[0];
      const cpf = pessoa?.dados_basicos?.cpf;
      const name = pessoa?.dados_basicos?.nome || "";

      if (!cpf) {
        mimirLogger.debug({ email }, "No CPF found in Mimir response");
        return null;
      }

      mimirLogger.info({ email, cpf, name }, "Found CPF by email in Mimir");
      return { cpf, name };
    } catch (error) {
      mimirLogger.error({ email, error }, "Failed to lookup email in Mimir");
      throw AppError.serviceUnavailable("Mimir");
    }
  }
}
