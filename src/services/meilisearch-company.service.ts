/**
 * Meilisearch Company Service
 *
 * Integração com Meilisearch IBVI (65.2M empresas brasileiras)
 * Permite buscar empresas por CNPJ, nome, ou CPF de sócio
 *
 * Base: https://ibvi-meilisearch-v2.fly.dev
 */

import { getConfig } from "../config";
import { enrichmentLogger } from "../utils/logger";

export interface MeilisearchSocio {
  cpf: string;
  nome: string;
  qualificacao: string;
  data_entrada: string;
  percentual: number | null;
  faixa_etaria: string;
}

export interface MeilisearchCompany {
  id: string;
  cnpj: string;
  cnpj_basico: string;
  cnpj_ordem: string;
  cnpj_dv: string;
  razao_social: string;
  nome_fantasia?: string;
  capital_social: number;
  porte: string;
  natureza_juridica: string;
  data_abertura: string;
  situacao_cadastral: string;
  data_situacao_cadastral: string;
  cnae_principal: string;
  cnaes_secundarios: string[];
  endereco_completo: string;
  tipo_logradouro?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  uf?: string;
  municipio?: string;
  municipio_nome?: string;
  email?: string;
  telefone?: string;
  ddd?: string;
  latitude?: number | null;
  longitude?: number | null;
  socios: MeilisearchSocio[];
  socios_cpfs: string[];
  socios_nomes: string[];
}

export interface CompanySummary {
  totalCompanies: number;
  totalCapitalSocial: number;
  companies: Array<{
    cnpj: string;
    razaoSocial: string;
    nomeFantasia?: string;
    capitalSocial: number;
    situacao: string;
    uf?: string;
    isAdministrador: boolean;
  }>;
}

export class MeilisearchCompanyService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly enabled: boolean;

  constructor() {
    this.baseUrl =
      process.env.MEILISEARCH_URL || "https://ibvi-meilisearch-v2.fly.dev";
    this.apiKey = process.env.MEILISEARCH_KEY || "";
    this.enabled = !!this.apiKey;

    if (!this.enabled) {
      enrichmentLogger.warn(
        "Meilisearch Company Service disabled - no API key",
      );
    }
  }

  /**
   * Check if service is available
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Search companies by name or CNPJ
   */
  async searchCompanies(
    query: string,
    limit = 100,
  ): Promise<MeilisearchCompany[]> {
    if (!this.enabled) return [];

    try {
      const response = await fetch(`${this.baseUrl}/indexes/companies/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, limit }),
      });

      if (!response.ok) {
        enrichmentLogger.error(
          { status: response.status, query },
          "Meilisearch search failed",
        );
        return [];
      }

      const data = await response.json();
      return data.hits || [];
    } catch (error) {
      enrichmentLogger.error({ error, query }, "Failed to search companies");
      return [];
    }
  }

  /**
   * Get company by CNPJ
   */
  async getCompanyByCnpj(cnpj: string): Promise<MeilisearchCompany | null> {
    if (!this.enabled) return null;

    // Normalize CNPJ (remove formatting)
    const normalizedCnpj = cnpj.replace(/\D/g, "");

    try {
      const response = await fetch(`${this.baseUrl}/indexes/companies/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: `cnpj = ${normalizedCnpj}`,
          limit: 1,
        }),
      });

      if (!response.ok) {
        enrichmentLogger.error(
          { status: response.status, cnpj },
          "Meilisearch CNPJ lookup failed",
        );
        return null;
      }

      const data = await response.json();
      const hits = data.hits || [];
      return hits.length > 0 ? hits[0] : null;
    } catch (error) {
      enrichmentLogger.error({ error, cnpj }, "Failed to get company by CNPJ");
      return null;
    }
  }

  /**
   * Find all companies where a CPF is a socio
   */
  async findCompaniesByCpf(cpf: string, limit = 50): Promise<CompanySummary> {
    if (!this.enabled) {
      return {
        totalCompanies: 0,
        totalCapitalSocial: 0,
        companies: [],
      };
    }

    // Normalize CPF (remove formatting)
    const normalizedCpf = cpf.replace(/\D/g, "");

    enrichmentLogger.info({ cpf: normalizedCpf }, "Searching companies by CPF");

    try {
      // Use filter instead of attributesToSearchOn for exact CPF matching in arrays
      const response = await fetch(`${this.baseUrl}/indexes/companies/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: `socios_cpfs = ${normalizedCpf}`,
          limit,
        }),
      });

      if (!response.ok) {
        enrichmentLogger.error(
          { status: response.status, cpf: normalizedCpf },
          "Meilisearch CPF search failed",
        );
        return {
          totalCompanies: 0,
          totalCapitalSocial: 0,
          companies: [],
        };
      }

      const data = await response.json();
      const companies: MeilisearchCompany[] = data.hits || [];

      // Filter only active companies (situacao_cadastral = "02")
      const activeCompanies = companies.filter(
        (c) => c.situacao_cadastral === "02",
      );

      // Calculate totals
      const totalCapitalSocial = activeCompanies.reduce(
        (sum, c) => sum + (c.capital_social || 0),
        0,
      );

      // Map to summary format
      const companiesSummary = activeCompanies.map((c) => {
        // Check if CPF is administrador (qualificacao "49" or "08")
        const socio = c.socios.find((s) => s.cpf === normalizedCpf);
        const isAdministrador = socio
          ? ["49", "08", "10", "16"].includes(socio.qualificacao)
          : false;

        return {
          cnpj: c.cnpj,
          razaoSocial: c.razao_social,
          nomeFantasia: c.nome_fantasia || undefined,
          capitalSocial: c.capital_social || 0,
          situacao: c.situacao_cadastral,
          uf: c.uf,
          isAdministrador,
        };
      });

      // Sort by capital social (descending)
      companiesSummary.sort((a, b) => b.capitalSocial - a.capitalSocial);

      enrichmentLogger.info(
        {
          cpf: normalizedCpf,
          totalCompanies: companiesSummary.length,
          totalCapital: totalCapitalSocial,
        },
        "Found companies for CPF",
      );

      return {
        totalCompanies: companiesSummary.length,
        totalCapitalSocial,
        companies: companiesSummary,
      };
    } catch (error) {
      enrichmentLogger.error(
        { error, cpf: normalizedCpf },
        "Failed to find companies by CPF",
      );
      return {
        totalCompanies: 0,
        totalCapitalSocial: 0,
        companies: [],
      };
    }
  }

  /**
   * Format company summary for C2S message
   */
  formatCompaniesForMessage(summary: CompanySummary): string {
    if (summary.totalCompanies === 0) {
      return "";
    }

    const lines: string[] = [];
    lines.push(
      `\n🏢 EMPRESÁRIO (${summary.totalCompanies} empresa${summary.totalCompanies > 1 ? "s" : ""})`,
    );

    if (summary.totalCapitalSocial > 0) {
      lines.push(
        `   Capital total: R$ ${this.formatCurrency(summary.totalCapitalSocial)}`,
      );
    }

    // Show top 3 companies
    const topCompanies = summary.companies.slice(0, 3);
    for (const company of topCompanies) {
      let line = `   • ${company.razaoSocial}`;
      if (company.capitalSocial > 0) {
        line += ` - R$ ${this.formatCurrency(company.capitalSocial)}`;
      }
      if (company.isAdministrador) {
        line += ` (Admin)`;
      }
      if (company.uf) {
        line += ` [${company.uf}]`;
      }
      lines.push(line);
    }

    if (summary.companies.length > 3) {
      lines.push(`   ... e mais ${summary.companies.length - 3} empresa(s)`);
    }

    return lines.join("\n");
  }

  private formatCurrency(value: number): string {
    return value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
