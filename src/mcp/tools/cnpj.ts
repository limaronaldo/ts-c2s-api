/**
 * MCP Tools - CNPJ Company Lookup
 * RML-993: Company lookup and portfolio analysis
 *
 * Tools:
 * - lookup_cnpj: Get company info by CNPJ
 * - find_companies_by_cpf: Find companies where person is partner/owner
 * - analyze_company_portfolio: Aggregated portfolio analysis
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";

export const cnpjTools: Tool[] = [
  {
    name: "lookup_cnpj",
    description:
      "Look up company information by CNPJ. Returns company name, status, capital, sector, location, and list of partners/owners. Uses ReceitaWS and Brasil API.",
    inputSchema: {
      type: "object",
      properties: {
        cnpj: {
          type: "string",
          description: "CNPJ number (14 digits, with or without formatting)",
        },
      },
      required: ["cnpj"],
    },
  },
  {
    name: "find_companies_by_name",
    description:
      "Find all companies where a person is listed as partner, owner, or administrator. Searches by person name. Returns list of active companies with roles and capital.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Person's full name to search",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "analyze_company_portfolio",
    description:
      "Analyze a person's company portfolio. Returns aggregated data: total companies, total capital, sectors involved, and roles held. Useful for assessing business profile.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Person's full name",
        },
      },
      required: ["name"],
    },
  },
];

export async function handleCnpjTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "lookup_cnpj": {
      const { cnpj } = args as { cnpj: string };

      // Clean CNPJ
      const cleanCnpj = cnpj.replace(/\D/g, "");
      if (cleanCnpj.length !== 14) {
        return {
          success: false,
          error: "Invalid CNPJ format. Must have 14 digits.",
        };
      }

      try {
        const company = await container.cnpjLookup.lookupCnpj(cleanCnpj);

        if (!company) {
          return {
            success: false,
            error: "Company not found or CNPJ invalid",
          };
        }

        return {
          success: true,
          cnpj: company.cnpj,
          company: {
            razaoSocial: company.razaoSocial,
            nomeFantasia: company.nomeFantasia,
            situacao: company.situacao,
            capitalSocial: company.capitalSocial,
            capitalFormatted: company.capitalSocial
              ? `R$ ${company.capitalSocial.toLocaleString("pt-BR")}`
              : null,
            atividadePrincipal: company.atividadePrincipal,
            municipio: company.municipio,
            uf: company.uf,
            dataAbertura: company.dataAbertura,
          },
          socios: company.socios?.map((s) => ({
            nome: s.nome,
            qualificacao: s.qualificacao,
          })),
          sociosCount: company.socios?.length || 0,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Lookup failed",
        };
      }
    }

    case "find_companies_by_name": {
      const { name } = args as { name: string };

      if (!name || name.length < 3) {
        return {
          success: false,
          error: "Name must have at least 3 characters",
        };
      }

      try {
        const result = await container.cnpjLookup.searchCompaniesByName(name);

        if (!result.success) {
          return {
            success: false,
            error: result.error || "Search failed",
          };
        }

        if (result.companies.length === 0) {
          return {
            success: true,
            found: false,
            name,
            message: "No companies found for this person",
            companies: [],
          };
        }

        return {
          success: true,
          found: true,
          name,
          count: result.companies.length,
          source: result.source,
          companies: result.companies.map((c) => ({
            cnpj: c.cnpj,
            razaoSocial: c.razaoSocial,
            nomeFantasia: c.nomeFantasia,
            situacao: c.situacao,
            capitalSocial: c.capitalSocial,
            capitalFormatted: c.capitalSocial
              ? `R$ ${c.capitalSocial.toLocaleString("pt-BR")}`
              : null,
            atividadePrincipal: c.atividadePrincipal,
            municipio: c.municipio,
            uf: c.uf,
          })),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Search failed",
        };
      }
    }

    case "analyze_company_portfolio": {
      const { name } = args as { name: string };

      if (!name || name.length < 3) {
        return {
          success: false,
          error: "Name must have at least 3 characters",
        };
      }

      try {
        const result = await container.cnpjLookup.searchCompaniesByName(name);

        if (!result.success || result.companies.length === 0) {
          return {
            success: true,
            name,
            hasCompanies: false,
            message: "No company portfolio found for this person",
            portfolio: null,
          };
        }

        // Aggregate data
        const activeCompanies = result.companies.filter(
          (c) => c.situacao?.toUpperCase() === "ATIVA",
        );

        const totalCapital = activeCompanies.reduce(
          (sum, c) => sum + (c.capitalSocial || 0),
          0,
        );

        // Extract unique sectors
        const sectors = [
          ...new Set(
            activeCompanies
              .map((c) => c.atividadePrincipal)
              .filter(Boolean) as string[],
          ),
        ];

        // Extract unique locations
        const locations = [
          ...new Set(
            activeCompanies
              .map((c) => (c.municipio && c.uf ? `${c.municipio}/${c.uf}` : null))
              .filter(Boolean) as string[],
          ),
        ];

        // Find roles
        const roles = new Set<string>();
        for (const company of activeCompanies) {
          if (company.socios) {
            for (const socio of company.socios) {
              const normalizedName = name.toUpperCase();
              if (
                socio.nome?.toUpperCase().includes(normalizedName) ||
                normalizedName.includes(socio.nome?.toUpperCase() || "")
              ) {
                if (socio.qualificacao) {
                  roles.add(socio.qualificacao);
                }
              }
            }
          }
        }

        // Determine profile tier
        let profileTier: string;
        if (activeCompanies.length >= 5 || totalCapital >= 5000000) {
          profileTier = "high";
        } else if (activeCompanies.length >= 2 || totalCapital >= 500000) {
          profileTier = "medium";
        } else {
          profileTier = "standard";
        }

        return {
          success: true,
          name,
          hasCompanies: true,
          portfolio: {
            totalCompanies: result.companies.length,
            activeCompanies: activeCompanies.length,
            totalCapital,
            totalCapitalFormatted: `R$ ${totalCapital.toLocaleString("pt-BR")}`,
            avgCapitalPerCompany:
              activeCompanies.length > 0
                ? Math.round(totalCapital / activeCompanies.length)
                : 0,
            sectors: sectors.slice(0, 5),
            locations: locations.slice(0, 5),
            roles: [...roles],
            profileTier,
          },
          recommendation:
            profileTier === "high"
              ? "High-value business profile - multiple companies with significant capital"
              : profileTier === "medium"
                ? "Active entrepreneur - good business portfolio"
                : "Small business owner - standard profile",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Analysis failed",
        };
      }
    }

    default:
      throw new Error(`Unknown CNPJ tool: ${name}`);
  }
}
