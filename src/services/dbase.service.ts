import { getConfig } from "../config";
import { dbaseLogger } from "../utils/logger";
import { normalizePhone } from "../utils/phone";
import { AppError } from "../errors/app-error";

export interface DBaseResponse {
  status: boolean;
  msg?: string;
  cpf?: string;
  nome?: string;
  data_nascimento?: string;
  sexo?: string;
  mae?: string;
  situacao_cpf?: string;
}

/**
 * DBase API Service (fallback for phone to CPF lookup)
 * Uses multipart form-data with token in body (not header)
 */
export class DBaseService {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor() {
    const config = getConfig();
    this.token = config.DBASE_KEY;
    this.baseUrl = config.DBASE_URL;
  }

  async findCpfByPhone(
    phone: string,
  ): Promise<{ cpf: string; name: string } | null> {
    const normalizedPhone = normalizePhone(phone);
    dbaseLogger.info(
      { phone: normalizedPhone },
      "Looking up CPF by phone in DBase",
    );

    try {
      // DBase uses multipart form-data with:
      // - consulta: "telefone" (query type)
      // - telefone: the phone number
      // - token: API key (NOT Bearer auth header)
      const formData = new FormData();
      formData.append("consulta", "telefone");
      formData.append("telefone", normalizedPhone);
      formData.append("token", this.token);

      // DBase API posts directly to base URL (not /api/telefone)
      const response = await fetch(this.baseUrl, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        if (response.status === 404) {
          dbaseLogger.debug(
            { phone: normalizedPhone },
            "Phone not found in DBase",
          );
          return null;
        }
        throw new Error(`DBase returned ${response.status}`);
      }

      const data = (await response.json()) as DBaseResponse;

      dbaseLogger.info(
        { phone: normalizedPhone, response: data },
        "DBase API response received",
      );

      // Check for IP whitelisting error
      if (!data.status && data.msg?.includes("ip não está liberado")) {
        dbaseLogger.error(
          { phone: normalizedPhone, msg: data.msg },
          "DBase API: IP not whitelisted",
        );
        return null;
      }

      if (!data.status || !data.cpf) {
        dbaseLogger.debug(
          { phone: normalizedPhone, msg: data.msg },
          "No CPF found in DBase",
        );
        return null;
      }

      dbaseLogger.info(
        { phone: normalizedPhone, cpf: data.cpf, name: data.nome },
        "Found CPF by phone in DBase",
      );
      return { cpf: data.cpf, name: data.nome || "" };
    } catch (error) {
      dbaseLogger.error(
        { phone: normalizedPhone, error },
        "Failed to lookup phone in DBase",
      );
      throw AppError.serviceUnavailable("DBase");
    }
  }
}
