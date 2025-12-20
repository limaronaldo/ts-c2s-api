import { getConfig } from "../config";
import { diretrixLogger } from "../utils/logger";
import { normalizePhone } from "../utils/phone";
import { AppError } from "../errors/app-error";

/**
 * Diretrix API response format for phone/email queries
 * Returns array of simplified person records
 */
export interface DiretrixPessoaSimplificada {
  nome: string;
  cpf: string;
}

// Legacy interface kept for backwards compatibility
export interface DiretrixResponse {
  cpf?: string;
  nome?: string;
  erro?: string;
}

export class DiretrixService {
  private readonly user: string;
  private readonly pass: string;
  private readonly baseUrl: string;

  constructor() {
    const config = getConfig();
    this.user = config.DIRETRIX_USER;
    this.pass = config.DIRETRIX_PASS;
    this.baseUrl = config.DIRETRIX_URL;
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.user}:${this.pass}`).toString(
      "base64",
    );
    return `Basic ${credentials}`;
  }

  async findCpfByPhone(
    phone: string,
  ): Promise<{ cpf: string; name: string } | null> {
    const normalizedPhone = normalizePhone(phone);
    diretrixLogger.info(
      { phone: normalizedPhone },
      "Looking up CPF by phone in Diretrix",
    );

    try {
      // Correct endpoint: /Consultas/Pessoa/Telefone/{phone}
      const response = await fetch(
        `${this.baseUrl}/Consultas/Pessoa/Telefone/${normalizedPhone}`,
        {
          method: "GET",
          headers: {
            Authorization: this.getAuthHeader(),
          },
          signal: AbortSignal.timeout(30000),
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          diretrixLogger.debug(
            { phone: normalizedPhone },
            "Phone not found in Diretrix",
          );
          return null;
        }
        const errorText = await response.text().catch(() => "");
        diretrixLogger.warn(
          { phone: normalizedPhone, status: response.status, error: errorText },
          "Diretrix returned error",
        );
        throw new Error(`Diretrix returned ${response.status}`);
      }

      // Response is an array of PessoaSimplificada
      const data = (await response.json()) as DiretrixPessoaSimplificada[];

      if (!Array.isArray(data) || data.length === 0) {
        diretrixLogger.debug(
          { phone: normalizedPhone },
          "No results found for phone in Diretrix",
        );
        return null;
      }

      // Return first person with valid CPF
      const person = data.find((p) => p.cpf && p.cpf.length === 11);
      if (!person) {
        diretrixLogger.debug(
          { phone: normalizedPhone, count: data.length },
          "No valid CPF found in Diretrix results",
        );
        return null;
      }

      diretrixLogger.info(
        {
          phone: normalizedPhone,
          cpf: person.cpf,
          name: person.nome,
          totalResults: data.length,
        },
        "Found CPF by phone in Diretrix",
      );
      return { cpf: person.cpf, name: person.nome || "" };
    } catch (error) {
      diretrixLogger.error(
        { phone: normalizedPhone, error: String(error) },
        "Failed to lookup phone in Diretrix",
      );
      throw AppError.serviceUnavailable("Diretrix");
    }
  }

  async findCpfByEmail(email: string): Promise<string | null> {
    const result = await this.findCpfByEmailWithName(email);
    return result?.cpf ?? null;
  }

  async findCpfByEmailWithName(
    email: string,
  ): Promise<{ cpf: string; name: string } | null> {
    diretrixLogger.info({ email }, "Looking up CPF by email in Diretrix");

    try {
      // Correct endpoint: /Consultas/Pessoa/Email/{email}
      const response = await fetch(
        `${this.baseUrl}/Consultas/Pessoa/Email/${encodeURIComponent(email)}`,
        {
          method: "GET",
          headers: {
            Authorization: this.getAuthHeader(),
          },
          signal: AbortSignal.timeout(30000),
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          diretrixLogger.debug({ email }, "Email not found in Diretrix");
          return null;
        }
        const errorText = await response.text().catch(() => "");
        diretrixLogger.warn(
          { email, status: response.status, error: errorText },
          "Diretrix returned error",
        );
        throw new Error(`Diretrix returned ${response.status}`);
      }

      // Response is an array of PessoaSimplificada
      const data = (await response.json()) as DiretrixPessoaSimplificada[];

      if (!Array.isArray(data) || data.length === 0) {
        diretrixLogger.debug(
          { email },
          "No results found for email in Diretrix",
        );
        return null;
      }

      // Return first person with valid CPF
      const person = data.find((p) => p.cpf && p.cpf.length === 11);
      if (!person) {
        diretrixLogger.debug(
          { email, count: data.length },
          "No valid CPF found in Diretrix results",
        );
        return null;
      }

      diretrixLogger.info(
        {
          email,
          cpf: person.cpf,
          name: person.nome,
          totalResults: data.length,
        },
        "Found CPF by email in Diretrix",
      );
      return { cpf: person.cpf, name: person.nome || "" };
    } catch (error) {
      diretrixLogger.error(
        { email, error: String(error) },
        "Failed to lookup email in Diretrix",
      );
      throw AppError.serviceUnavailable("Diretrix");
    }
  }
}
