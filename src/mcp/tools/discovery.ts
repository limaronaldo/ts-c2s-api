import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";

export const discoveryTools: Tool[] = [
  {
    name: "find_and_save_person",
    description:
      "Find a person by phone/name, fetch full data from Work API, and save to PostgreSQL. This is the complete workflow: discover CPF -> fetch enrichment data -> persist to database. Returns the saved party ID and all enriched data.",
    inputSchema: {
      type: "object",
      properties: {
        phone: {
          type: "string",
          description: "Phone number with DDD (e.g., 11999887766)",
        },
        name: {
          type: "string",
          description: "Person name (helps with CPF matching and validation)",
        },
        email: {
          type: "string",
          description: "Email address (optional, used as fallback)",
        },
      },
      required: ["phone"],
    },
  },
  {
    name: "discover_cpf",
    description:
      "Find CPF using 4-tier discovery: Work API -> CPF Lookup (223M records) -> Diretrix -> DBase. Returns CPF with source tier and confidence score. Best results when both phone and name are provided.",
    inputSchema: {
      type: "object",
      properties: {
        phone: {
          type: "string",
          description: "Phone number with DDD (e.g., 11999887766)",
        },
        email: {
          type: "string",
          description: "Email address (used as fallback)",
        },
        name: {
          type: "string",
          description:
            "Person name for validation (required for CPF Lookup tier)",
        },
      },
    },
  },
  {
    name: "lookup_cpf",
    description:
      "Get full person data for a known CPF. Returns name, birth date, mother name, income estimate, addresses, phones, emails, and employment history.",
    inputSchema: {
      type: "object",
      properties: {
        cpf: {
          type: "string",
          description: "CPF number (11 digits, with or without formatting)",
        },
      },
      required: ["cpf"],
    },
  },
  {
    name: "search_cpf_by_name",
    description:
      "Search the CPF database (223M records) by person name. Returns potential matches with similarity scores. Useful when you only have a name. Note: This can take 1-2 minutes for common names.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Full name to search (first and last name recommended)",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 10)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "validate_cpf",
    description:
      "Validate a CPF number. Checks mathematical validity and whether it exists in the database. Returns basic info if found.",
    inputSchema: {
      type: "object",
      properties: {
        cpf: {
          type: "string",
          description: "CPF number to validate",
        },
      },
      required: ["cpf"],
    },
  },
];

export async function handleDiscoveryTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "find_and_save_person": {
      const {
        phone,
        name: personName,
        email,
      } = args as {
        phone: string;
        name?: string;
        email?: string;
      };

      // Step 1: Discover CPF via Work API phone module
      const phoneResult =
        await container.workApi.fetchByPhoneWithTimeout(phone);

      if (!phoneResult.data || phoneResult.data.length === 0) {
        return {
          success: false,
          error: "No results found for this phone number",
          phone,
          timedOut: phoneResult.timedOut,
        };
      }

      // Filter to find person (not company) - exclude LTDA, S/A, etc.
      const personMatch = phoneResult.data.find(
        (m: { cpf_cnpj: string; nome: string }) => {
          if (!m.cpf_cnpj || !m.nome) return false;

          const rawDoc = m.cpf_cnpj;
          const doc = rawDoc.length === 14 ? rawDoc.slice(-11) : rawDoc;

          // Company indicators in name
          const companyPatterns = [
            "LIMITADA",
            "LTDA",
            "S/A",
            "S.A.",
            "S.A",
            "EIRELI",
            " ME",
            "ME ",
            " EPP",
            "EPP ",
            "COMERCIO",
            "SERVICOS",
            "INDUSTRIA",
            "HOLDINGS",
            "PARTICIPACOES",
            "INVESTIMENTOS",
            "ADMINISTRADORA",
            "INCORPORADORA",
            "CONSTRUTORA",
            "IMOBILIARIA",
            "CORRETORA",
            "CONSULTORIA",
          ];

          const upperName = m.nome.toUpperCase();
          const isCompany = companyPatterns.some((pattern) =>
            upperName.includes(pattern),
          );

          return doc.length === 11 && !isCompany;
        },
      );

      if (!personMatch) {
        return {
          success: false,
          error: "No person (CPF) found, only companies (CNPJ)",
          phone,
          matches: phoneResult.data.map(
            (m: { cpf_cnpj: string; nome: string }) => ({
              name: m.nome,
              document: m.cpf_cnpj,
            }),
          ),
        };
      }

      // Normalize CPF
      let cpf = personMatch.cpf_cnpj;
      if (cpf.length === 14) cpf = cpf.slice(-11);

      // Step 2: Fetch full data from Work API
      const fullData = await container.workApi.fetchByCpf(cpf);

      if (!fullData) {
        return {
          success: false,
          error: "CPF found but could not fetch full data",
          cpf,
          foundName: personMatch.nome,
        };
      }

      // Step 3: Parse and save to PostgreSQL
      let birthDate: Date | undefined;
      if (fullData.dataNascimento) {
        const parts = fullData.dataNascimento.split("/");
        if (parts.length === 3) {
          birthDate = new Date(
            parseInt(parts[2]),
            parseInt(parts[1]) - 1,
            parseInt(parts[0]),
          );
        }
      }

      // Calculate income with multiplier (1.9x)
      const rawIncome = fullData.renda || fullData.rendaPresumida;
      const income = rawIncome ? rawIncome * 1.9 : undefined;

      // Upsert party
      const party = await container.dbStorage.upsertParty({
        type: "person",
        cpfCnpj: cpf,
        name: fullData.nome,
        birthDate,
        gender: fullData.sexo?.startsWith("F")
          ? "female"
          : fullData.sexo?.startsWith("M")
            ? "male"
            : undefined,
        motherName: fullData.nomeMae,
        income: income?.toString(),
      });

      // Save contacts - phones
      const savedPhones: string[] = [];
      if (fullData.telefones?.length) {
        for (const tel of fullData.telefones) {
          if (tel.numero) {
            try {
              await container.dbStorage.upsertContact({
                partyId: party.id,
                type: "phone",
                value: tel.numero,
                isPrimary: tel.numero === phone,
              });
              savedPhones.push(tel.numero);
            } catch {
              // Ignore duplicates
            }
          }
        }
      }

      // Save contacts - emails
      const savedEmails: string[] = [];
      if (fullData.emails?.length) {
        for (const e of fullData.emails) {
          if (e.email) {
            try {
              await container.dbStorage.upsertContact({
                partyId: party.id,
                type: "email",
                value: e.email.toLowerCase(),
                isPrimary: false,
              });
              savedEmails.push(e.email.toLowerCase());
            } catch {
              // Ignore duplicates
            }
          }
        }
      }

      // Save addresses
      const savedAddresses: Array<{
        street: string;
        neighborhood: string;
        city: string;
      }> = [];
      if (fullData.enderecos?.length) {
        for (const addr of fullData.enderecos) {
          try {
            await container.dbStorage.upsertAddress({
              partyId: party.id,
              street: addr.logradouro,
              number: addr.numero || "S/N",
              complement: addr.complemento,
              neighborhood: addr.bairro,
              city: addr.cidade,
              state: addr.uf,
              zipCode: addr.cep,
            });
            savedAddresses.push({
              street: addr.logradouro || "",
              neighborhood: addr.bairro || "",
              city: addr.cidade || "",
            });
          } catch {
            // Ignore duplicates
          }
        }
      }

      // Format CPF for display
      const cpfFormatted = cpf.replace(
        /(\d{3})(\d{3})(\d{3})(\d{2})/,
        "$1.$2.$3-$4",
      );

      return {
        success: true,
        saved: true,
        partyId: party.id,
        person: {
          cpf: cpfFormatted,
          name: fullData.nome,
          birthDate: fullData.dataNascimento,
          gender: fullData.sexo,
          motherName: fullData.nomeMae,
          income: income ? `R$ ${income.toLocaleString("pt-BR")}` : null,
        },
        contacts: {
          phones: savedPhones,
          emails: savedEmails,
          totalPhones: savedPhones.length,
          totalEmails: savedEmails.length,
        },
        addresses: {
          list: savedAddresses.slice(0, 5),
          total: savedAddresses.length,
        },
        summary: `Saved ${fullData.nome} (CPF ${cpfFormatted}) with ${savedPhones.length} phones, ${savedEmails.length} emails, ${savedAddresses.length} addresses`,
      };
    }

    case "discover_cpf": {
      const {
        phone,
        email,
        name: personName,
      } = args as {
        phone?: string;
        email?: string;
        name?: string;
      };

      if (!phone && !email) {
        return {
          success: false,
          error: "At least phone or email is required for CPF discovery",
        };
      }

      // Try phone-based discovery first
      if (phone) {
        const result = await container.cpfDiscovery.findCpfByPhone(
          phone,
          personName,
        );

        if (result) {
          return {
            success: true,
            cpf: result.cpf,
            foundName: result.foundName,
            source: result.source,
            matchScore: result.matchScore,
            nameMatches: result.nameMatches,
            matchMethod: result.matchMethod,
          };
        }
      }

      // Try email-based discovery if phone failed
      if (email && personName) {
        const result = await container.cpfDiscovery.findCpfByEmail(
          email,
          personName,
        );

        if (result) {
          return {
            success: true,
            cpf: result.cpf,
            foundName: result.foundName,
            source: result.source,
            matchScore: result.matchScore,
            nameMatches: result.nameMatches,
            matchMethod: result.matchMethod,
          };
        }
      }

      return {
        success: false,
        message: "CPF not found via any discovery method",
        triedMethods: [
          phone ? "Work API (phone)" : null,
          phone && personName ? "CPF Lookup (name)" : null,
          phone ? "Diretrix (phone)" : null,
          phone ? "DBase (phone)" : null,
          email ? "Diretrix (email)" : null,
        ].filter(Boolean),
      };
    }

    case "lookup_cpf": {
      const { cpf } = args as { cpf: string };

      // Normalize CPF (remove formatting)
      const normalizedCpf = cpf.replace(/\D/g, "");

      if (normalizedCpf.length !== 11) {
        return {
          success: false,
          error: "CPF must have 11 digits",
        };
      }

      const result = await container.workApi.fetchByCpf(normalizedCpf);

      if (!result) {
        return {
          success: false,
          error: "No data found for this CPF",
        };
      }

      return {
        success: true,
        data: {
          cpf: result.cpf,
          name: result.name,
          birthDate: result.birthDate,
          age: result.age,
          gender: result.gender,
          motherName: result.motherName,
          income: result.income,
          addresses: result.addresses?.slice(0, 5), // Limit for readability
          phones: result.phones?.slice(0, 10),
          emails: result.emails?.slice(0, 5),
          // Include summary counts
          totalAddresses: result.addresses?.length || 0,
          totalPhones: result.phones?.length || 0,
          totalEmails: result.emails?.length || 0,
        },
      };
    }

    case "search_cpf_by_name": {
      const { name: searchName, limit = 10 } = args as {
        name: string;
        limit?: number;
      };

      if (!searchName || searchName.length < 5) {
        return {
          success: false,
          error: "Name must be at least 5 characters for search",
        };
      }

      const results = await container.cpfLookup.searchByName(searchName, limit);

      if (!results || results.length === 0) {
        return {
          success: false,
          message: "No matches found for this name",
          searchedName: searchName,
        };
      }

      return {
        success: true,
        searchedName: searchName,
        matchCount: results.length,
        matches: results.map((r) => ({
          cpf: r.cpf,
          name: r.name,
          score: r.score,
          birthYear: r.birthYear,
        })),
      };
    }

    case "validate_cpf": {
      const { cpf } = args as { cpf: string };

      // Normalize CPF
      const normalizedCpf = cpf.replace(/\D/g, "");

      // Mathematical validation
      const isValidFormat = validateCpfFormat(normalizedCpf);

      if (!isValidFormat) {
        return {
          success: true,
          cpf: normalizedCpf,
          isValid: false,
          reason: "Invalid CPF format (failed checksum validation)",
          existsInDatabase: false,
        };
      }

      // Check if exists in database
      const dbResult = await container.cpfLookup.getByCpf(normalizedCpf);

      return {
        success: true,
        cpf: normalizedCpf,
        isValid: true,
        existsInDatabase: !!dbResult,
        basicInfo: dbResult
          ? {
              name: dbResult.name,
              birthYear: dbResult.birthYear,
            }
          : null,
      };
    }

    default:
      throw new Error(`Unknown discovery tool: ${name}`);
  }
}

// CPF checksum validation
function validateCpfFormat(cpf: string): boolean {
  if (cpf.length !== 11) return false;

  // Check for known invalid patterns (all same digits)
  if (/^(\d)\1+$/.test(cpf)) return false;

  // Validate first check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cpf[9])) return false;

  // Validate second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cpf[10])) return false;

  return true;
}
