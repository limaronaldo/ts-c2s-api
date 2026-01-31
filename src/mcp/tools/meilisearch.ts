/**
 * MCP Tools: Meilisearch Company Lookup
 *
 * Tools for searching Brazilian companies (65.2M CNPJs)
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";

// Tool definitions
export const meilisearchTools: Tool[] = [
  {
    name: "find_companies_by_cpf",
    description:
      "Find all companies where a CPF is a socio (partner). Returns company list with capital social totals. Use this to discover if a lead is a business owner and calculate their total business portfolio value.",
    inputSchema: {
      type: "object",
      properties: {
        cpf: {
          type: "string",
          description: "CPF of the person (with or without formatting)",
        },
      },
      required: ["cpf"],
    },
  },
  {
    name: "get_company_by_cnpj",
    description:
      "Get detailed company information by CNPJ including socios (partners), capital social, address, and activity codes. Use this to enrich company data.",
    inputSchema: {
      type: "object",
      properties: {
        cnpj: {
          type: "string",
          description: "CNPJ of the company (with or without formatting)",
        },
      },
      required: ["cnpj"],
    },
  },
  {
    name: "search_companies",
    description:
      "Search companies by name or CNPJ. Returns list of matching companies. Use this to find companies when you only have a name.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Company name or CNPJ to search",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 20)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "format_companies_message",
    description:
      "Format companies owned by a CPF for C2S message display. Returns formatted text ready to add to lead messages.",
    inputSchema: {
      type: "object",
      properties: {
        cpf: {
          type: "string",
          description: "CPF of the person",
        },
      },
      required: ["cpf"],
    },
  },
];

// Tool handlers
export async function handleMeilisearchTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "find_companies_by_cpf":
      return findCompaniesByCpf(args, container);
    case "get_company_by_cnpj":
      return getCompanyByCnpj(args, container);
    case "search_companies":
      return searchCompanies(args, container);
    case "format_companies_message":
      return formatCompaniesMessage(args, container);
    default:
      throw new Error(`Unknown Meilisearch tool: ${name}`);
  }
}

async function findCompaniesByCpf(
  args: Record<string, unknown>,
  container: ServiceContainer,
) {
  const cpf = args.cpf as string;

  if (!cpf) {
    return {
      success: false,
      error: "CPF is required",
    };
  }

  try {
    const summary = await container.meilisearchCompany.findCompaniesByCpf(cpf);

    return {
      success: true,
      cpf,
      totalCompanies: summary.totalCompanies,
      totalCapitalSocial: summary.totalCapitalSocial,
      totalCapitalSocialFormatted: new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(summary.totalCapitalSocial),
      companies: summary.companies.map((c) => ({
        cnpj: c.cnpj,
        razaoSocial: c.razaoSocial,
        nomeFantasia: c.nomeFantasia,
        capitalSocial: c.capitalSocial,
        capitalSocialFormatted: new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(c.capitalSocial),
        situacao: c.situacao === "02" ? "ATIVA" : "INATIVA",
        uf: c.uf,
        isAdministrador: c.isAdministrador,
        role: c.isAdministrador ? "Sócio-Administrador" : "Sócio",
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function getCompanyByCnpj(
  args: Record<string, unknown>,
  container: ServiceContainer,
) {
  const cnpj = args.cnpj as string;

  if (!cnpj) {
    return {
      success: false,
      error: "CNPJ is required",
    };
  }

  try {
    const company = await container.meilisearchCompany.getCompanyByCnpj(cnpj);

    if (!company) {
      return {
        success: false,
        error: "Company not found",
      };
    }

    return {
      success: true,
      company: {
        cnpj: company.cnpj,
        razaoSocial: company.razao_social,
        nomeFantasia: company.nome_fantasia,
        capitalSocial: company.capital_social,
        capitalSocialFormatted: new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(company.capital_social || 0),
        situacao: company.situacao_cadastral === "02" ? "ATIVA" : "INATIVA",
        dataAbertura: company.data_abertura,
        porte: company.porte,
        naturezaJuridica: company.natureza_juridica,
        cnaePrincipal: company.cnae_principal,
        enderecoCompleto: company.endereco_completo,
        uf: company.uf,
        municipio: company.municipio_nome,
        email: company.email,
        telefone: company.telefone,
        socios: company.socios.map((s) => ({
          nome: s.nome,
          cpf: s.cpf,
          qualificacao: s.qualificacao,
          dataEntrada: s.data_entrada,
          percentual: s.percentual,
        })),
        totalSocios: company.socios.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function searchCompanies(
  args: Record<string, unknown>,
  container: ServiceContainer,
) {
  const query = args.query as string;
  const limit = (args.limit as number) || 20;

  if (!query) {
    return {
      success: false,
      error: "Query is required",
    };
  }

  try {
    const companies = await container.meilisearchCompany.searchCompanies(
      query,
      limit,
    );

    return {
      success: true,
      query,
      totalFound: companies.length,
      companies: companies.map((c) => ({
        cnpj: c.cnpj,
        razaoSocial: c.razao_social,
        nomeFantasia: c.nome_fantasia,
        capitalSocial: c.capital_social,
        capitalSocialFormatted: new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(c.capital_social || 0),
        situacao: c.situacao_cadastral === "02" ? "ATIVA" : "INATIVA",
        uf: c.uf,
        municipio: c.municipio_nome,
        totalSocios: c.socios.length,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function formatCompaniesMessage(
  args: Record<string, unknown>,
  container: ServiceContainer,
) {
  const cpf = args.cpf as string;

  if (!cpf) {
    return {
      success: false,
      error: "CPF is required",
    };
  }

  try {
    const summary = await container.meilisearchCompany.findCompaniesByCpf(cpf);
    const message =
      container.meilisearchCompany.formatCompaniesForMessage(summary);

    return {
      success: true,
      cpf,
      totalCompanies: summary.totalCompanies,
      message,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
