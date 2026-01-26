/**
 * Bulk Enrichment Service - Enriquecimento em massa de pessoas/empresas
 *
 * Este serviço permite enriquecer múltiplos registros a partir de:
 * - Lista de CPFs conhecidos
 * - Lista de nomes (descoberta de CPF + enriquecimento)
 * - Lista de telefones (descoberta de CPF + enriquecimento)
 */

import { getConfig } from "../config";
import { WorkApiService, type WorkApiPerson } from "./work-api.service";
import { CpfLookupService, type CpfLookupResult } from "./cpf-lookup.service";
import { DbStorageService } from "./db-storage.service";

// Logger inline
const log = (level: string, msg: string, data?: Record<string, unknown>) => {
  console.log(
    JSON.stringify({
      level,
      module: "bulk-enrichment",
      msg,
      ...data,
      timestamp: new Date().toISOString(),
    }),
  );
};

export interface PersonInput {
  name?: string;
  cpf?: string;
  phone?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

export interface EnrichedPerson {
  input: PersonInput;
  cpf?: string;
  cpfSource?: "input" | "duckdb" | "work-api-phone";
  workApiData?: WorkApiPerson;
  partyId?: string;
  status: "completed" | "partial" | "cpf_only" | "not_found" | "error";
  error?: string;
  phones: string[];
  emails: string[];
  income?: number;
  address?: {
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
}

export interface BulkEnrichmentResult {
  success: boolean;
  total: number;
  completed: number;
  partial: number;
  cpfOnly: number;
  notFound: number;
  errors: number;
  results: EnrichedPerson[];
  durationMs: number;
}

export interface BulkEnrichmentOptions {
  /** Delay entre requests em ms (default: 2000 para respeitar rate limit) */
  delayMs?: number;
  /** Salvar no banco de dados (default: true) */
  saveToDb?: boolean;
  /** Callback de progresso */
  onProgress?: (current: number, total: number, result: EnrichedPerson) => void;
  /** Tentar descobrir CPF por nome se não fornecido (default: true) */
  discoverCpfByName?: boolean;
  /** Tentar descobrir CPF por telefone se não fornecido (default: true) */
  discoverCpfByPhone?: boolean;
}

export class BulkEnrichmentService {
  private readonly workApi: WorkApiService;
  private readonly cpfLookup: CpfLookupService;
  private readonly dbStorage: DbStorageService;
  private readonly incomeMultiplier: number;

  constructor() {
    const config = getConfig();
    this.workApi = new WorkApiService();
    this.cpfLookup = new CpfLookupService();
    this.dbStorage = new DbStorageService();
    this.incomeMultiplier = config.INCOME_MULTIPLIER || 1.9;
  }

  /**
   * Enriquece uma lista de pessoas
   */
  async enrichBulk(
    persons: PersonInput[],
    options: BulkEnrichmentOptions = {},
  ): Promise<BulkEnrichmentResult> {
    const {
      delayMs = 2000,
      saveToDb = true,
      onProgress,
      discoverCpfByName = true,
      discoverCpfByPhone = true,
    } = options;

    const startTime = Date.now();
    const results: EnrichedPerson[] = [];

    let completed = 0;
    let partial = 0;
    let cpfOnly = 0;
    let notFound = 0;
    let errors = 0;

    log("info", "Starting bulk enrichment", { total: persons.length });

    for (let i = 0; i < persons.length; i++) {
      const person = persons[i];

      try {
        const enriched = await this.enrichSingle(person, {
          saveToDb,
          discoverCpfByName,
          discoverCpfByPhone,
        });

        results.push(enriched);

        // Contabilizar status
        switch (enriched.status) {
          case "completed":
            completed++;
            break;
          case "partial":
            partial++;
            break;
          case "cpf_only":
            cpfOnly++;
            break;
          case "not_found":
            notFound++;
            break;
          case "error":
            errors++;
            break;
        }

        if (onProgress) {
          onProgress(i + 1, persons.length, enriched);
        }

        log("info", "Person processed", {
          index: i + 1,
          total: persons.length,
          name: (person.name || person.cpf || "unknown").substring(0, 30),
          status: enriched.status,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        results.push({
          input: person,
          status: "error",
          error: errorMsg,
          phones: [],
          emails: [],
        });

        errors++;
        log("error", "Failed to process person", {
          name: person.name,
          error: errorMsg,
        });
      }

      // Rate limiting
      if (i < persons.length - 1 && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const durationMs = Date.now() - startTime;

    log("info", "Bulk enrichment completed", {
      total: persons.length,
      completed,
      partial,
      cpfOnly,
      notFound,
      errors,
      durationMs,
    });

    return {
      success: true,
      total: persons.length,
      completed,
      partial,
      cpfOnly,
      notFound,
      errors,
      results,
      durationMs,
    };
  }

  /**
   * Enriquece uma única pessoa
   */
  private async enrichSingle(
    person: PersonInput,
    options: {
      saveToDb: boolean;
      discoverCpfByName: boolean;
      discoverCpfByPhone: boolean;
    },
  ): Promise<EnrichedPerson> {
    const result: EnrichedPerson = {
      input: person,
      status: "not_found",
      phones: [],
      emails: [],
    };

    // Passo 1: Descobrir CPF
    let cpf = person.cpf?.replace(/\D/g, "");
    let cpfSource: "input" | "duckdb" | "work-api-phone" | undefined;

    if (cpf && cpf.length === 11) {
      cpfSource = "input";
    } else {
      // Tentar descobrir por telefone primeiro (mais rápido)
      if (options.discoverCpfByPhone && person.phone) {
        const phoneResult = await this.discoverCpfByPhone(person.phone);
        if (phoneResult) {
          cpf = phoneResult.cpf;
          cpfSource = "work-api-phone";
        }
      }

      // Se não encontrou, tentar por nome (mais lento)
      if (!cpf && options.discoverCpfByName && person.name) {
        const nameResult = await this.cpfLookup.findBestMatch(person.name);
        if (nameResult) {
          cpf = nameResult.cpf;
          cpfSource = "duckdb";
        }
      }
    }

    if (!cpf) {
      result.status = "not_found";
      return result;
    }

    result.cpf = cpf;
    result.cpfSource = cpfSource;

    // Passo 2: Enriquecer via Work API
    const workApiResult = await this.workApi.fetchByCpfWithTimeout(cpf);

    if (workApiResult.timedOut) {
      result.status = "cpf_only";
      return result;
    }

    if (!workApiResult.data) {
      result.status = "cpf_only";
      return result;
    }

    result.workApiData = workApiResult.data;
    result.status = "completed";

    // Extrair dados relevantes
    if (workApiResult.data.telefones) {
      result.phones = workApiResult.data.telefones
        .map((t) => t.numero)
        .filter((n): n is string => !!n);
    }

    if (workApiResult.data.emails) {
      result.emails = workApiResult.data.emails
        .map((e) => e.email)
        .filter((e): e is string => !!e);
    }

    if (workApiResult.data.renda) {
      result.income = workApiResult.data.renda * this.incomeMultiplier;
    }

    if (
      workApiResult.data.enderecos &&
      workApiResult.data.enderecos.length > 0
    ) {
      const addr = workApiResult.data.enderecos[0];
      result.address = {
        street: addr.logradouro,
        number: addr.numero,
        neighborhood: addr.bairro,
        city: addr.cidade,
        state: addr.uf,
      };
    }

    // Passo 3: Salvar no banco
    if (options.saveToDb) {
      try {
        const party = await this.saveToDatabase(
          cpf,
          workApiResult.data,
          person.metadata,
        );
        result.partyId = party.id;
      } catch (error) {
        log("error", "Failed to save to database", {
          cpf,
          error: String(error),
        });
        result.status = "partial";
      }
    }

    return result;
  }

  /**
   * Descobre CPF por telefone usando Work API
   */
  private async discoverCpfByPhone(
    phone: string,
  ): Promise<{ cpf: string; name: string } | null> {
    const normalizedPhone = phone.replace(/\D/g, "");

    try {
      const result =
        await this.workApi.fetchByPhoneWithTimeout(normalizedPhone);

      if (result.data && result.data.length > 0) {
        const first = result.data[0];
        // Normalizar CPF de 14 para 11 caracteres se necessário
        let cpf = first.cpf_cnpj;
        if (cpf && cpf.length === 14) {
          cpf = cpf.slice(-11);
        }
        return { cpf, name: first.nome || "" };
      }
    } catch (error) {
      log("warn", "Phone lookup failed", { error: String(error) });
    }

    return null;
  }

  /**
   * Salva dados enriquecidos no banco de dados
   */
  private async saveToDatabase(
    cpf: string,
    data: WorkApiPerson,
    metadata?: Record<string, unknown>,
  ): Promise<{ id: string }> {
    // Parse renda (numeric fields are strings in Drizzle)
    const income = data.renda
      ? String(data.renda * this.incomeMultiplier)
      : undefined;

    // Parse birth date
    let birthDate: Date | undefined;
    if (data.dataNascimento) {
      const parts = data.dataNascimento.split("/");
      if (parts.length === 3) {
        birthDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      }
    }

    // Upsert party
    const party = await this.dbStorage.upsertParty({
      type: "person",
      cpfCnpj: cpf,
      name: data.nome,
      birthDate,
      gender: data.sexo?.charAt(0),
      motherName: data.nomeMae,
      income,
      occupation: metadata?.occupation as string,
    });

    // Upsert contacts (phones)
    if (data.telefones) {
      for (const tel of data.telefones) {
        if (tel.numero) {
          await this.dbStorage.upsertContact({
            partyId: party.id,
            type: "phone",
            value: tel.numero,
          });
        }
      }
    }

    // Upsert contacts (emails)
    if (data.emails) {
      for (const email of data.emails) {
        if (email.email) {
          await this.dbStorage.upsertContact({
            partyId: party.id,
            type: "email",
            value: email.email,
          });
        }
      }
    }

    return party;
  }

  /**
   * Enriquece a partir de uma lista de CPFs
   */
  async enrichByCpfs(
    cpfs: string[],
    options: Omit<
      BulkEnrichmentOptions,
      "discoverCpfByName" | "discoverCpfByPhone"
    > = {},
  ): Promise<BulkEnrichmentResult> {
    const persons: PersonInput[] = cpfs.map((cpf) => ({
      name: "",
      cpf: cpf.replace(/\D/g, ""),
    }));

    return this.enrichBulk(persons, {
      ...options,
      discoverCpfByName: false,
      discoverCpfByPhone: false,
    });
  }

  /**
   * Enriquece a partir de uma lista de nomes (descobre CPF primeiro)
   */
  async enrichByNames(
    names: string[],
    options: Omit<BulkEnrichmentOptions, "discoverCpfByName"> = {},
  ): Promise<BulkEnrichmentResult> {
    const persons: PersonInput[] = names.map((name) => ({ name }));

    return this.enrichBulk(persons, {
      ...options,
      discoverCpfByName: true,
    });
  }
}
