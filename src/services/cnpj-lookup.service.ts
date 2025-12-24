/**
 * CNPJ Lookup Service - Consulta empresas via APIs públicas
 *
 * Fontes de dados:
 * - ReceitaWS (gratuito, limite 3/min)
 * - Brasil API (gratuito, fallback)
 *
 * Descobre empresas onde a pessoa é sócia/administradora
 */

import { enrichmentLogger } from '../utils/logger';

export interface CompanyInfo {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  situacao: string; // ATIVA, BAIXADA, etc
  capitalSocial?: number;
  atividadePrincipal?: string;
  municipio?: string;
  uf?: string;
  dataAbertura?: string;
  socios?: SocioInfo[];
}

export interface SocioInfo {
  nome: string;
  qualificacao: string; // Sócio-Administrador, Sócio, etc
  cpfCnpj?: string;
}

export interface CnpjSearchResult {
  success: boolean;
  companies: CompanyInfo[];
  error?: string;
  source?: string;
}

// Rate limiter simples para ReceitaWS (3 requests/min)
class RateLimiter {
  private timestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  canMakeRequest(): boolean {
    const now = Date.now();
    // Remove timestamps fora da janela
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    return this.timestamps.length < this.maxRequests;
  }

  recordRequest(): void {
    this.timestamps.push(Date.now());
  }

  getWaitTime(): number {
    if (this.canMakeRequest()) return 0;
    const oldest = this.timestamps[0];
    return this.windowMs - (Date.now() - oldest);
  }
}

export class CnpjLookupService {
  private rateLimiter: RateLimiter;
  private enabled: boolean;

  constructor() {
    // ReceitaWS: 3 requests por minuto
    this.rateLimiter = new RateLimiter(3, 60000);
    this.enabled = true;
  }

  /**
   * Busca informações de um CNPJ específico
   */
  async lookupCnpj(cnpj: string): Promise<CompanyInfo | null> {
    if (!this.enabled) return null;

    const cleanCnpj = cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      enrichmentLogger.warn({ cnpj }, 'Invalid CNPJ format');
      return null;
    }

    // Verifica rate limit
    if (!this.rateLimiter.canMakeRequest()) {
      const waitTime = this.rateLimiter.getWaitTime();
      enrichmentLogger.debug(
        { cnpj, waitTime },
        'Rate limited, waiting before CNPJ lookup'
      );
      await this.sleep(waitTime);
    }

    try {
      // Tenta ReceitaWS primeiro
      const result = await this.fetchFromReceitaWS(cleanCnpj);
      if (result) {
        this.rateLimiter.recordRequest();
        return result;
      }

      // Fallback para Brasil API
      return await this.fetchFromBrasilApi(cleanCnpj);
    } catch (error) {
      enrichmentLogger.error({ cnpj, error }, 'Failed to lookup CNPJ');
      return null;
    }
  }

  /**
   * Busca empresas por nome do sócio
   * Usa a API de busca por nome (quando disponível)
   */
  async searchCompaniesByName(name: string): Promise<CnpjSearchResult> {
    if (!this.enabled) {
      return { success: false, companies: [], error: 'Service disabled' };
    }

    // Normaliza o nome para busca
    const normalizedName = this.normalizeName(name);

    try {
      // Casa dos Dados oferece busca por sócio (gratuita, com limites)
      const result = await this.searchCasaDosDados(normalizedName);
      if (result.success && result.companies.length > 0) {
        return result;
      }

      // Se não encontrou, retorna vazio (não é erro)
      return {
        success: true,
        companies: [],
        source: 'none',
      };
    } catch (error) {
      enrichmentLogger.error({ name, error }, 'Failed to search companies by name');
      return {
        success: false,
        companies: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Consulta ReceitaWS (gratuita, 3/min)
   */
  private async fetchFromReceitaWS(cnpj: string): Promise<CompanyInfo | null> {
    try {
      const response = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          enrichmentLogger.warn('ReceitaWS rate limited');
          return null;
        }
        return null;
      }

      const data = await response.json();

      if (data.status === 'ERROR') {
        return null;
      }

      return {
        cnpj: data.cnpj,
        razaoSocial: data.nome,
        nomeFantasia: data.fantasia || undefined,
        situacao: data.situacao,
        capitalSocial: data.capital_social ? parseFloat(data.capital_social) : undefined,
        atividadePrincipal: data.atividade_principal?.[0]?.text,
        municipio: data.municipio,
        uf: data.uf,
        dataAbertura: data.abertura,
        socios: data.qsa?.map((s: any) => ({
          nome: s.nome,
          qualificacao: s.qual,
        })),
      };
    } catch (error) {
      enrichmentLogger.debug({ cnpj, error }, 'ReceitaWS lookup failed');
      return null;
    }
  }

  /**
   * Consulta Brasil API (fallback gratuito)
   */
  private async fetchFromBrasilApi(cnpj: string): Promise<CompanyInfo | null> {
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      return {
        cnpj: data.cnpj,
        razaoSocial: data.razao_social,
        nomeFantasia: data.nome_fantasia || undefined,
        situacao: data.descricao_situacao_cadastral,
        capitalSocial: data.capital_social,
        atividadePrincipal: data.cnae_fiscal_descricao,
        municipio: data.municipio,
        uf: data.uf,
        dataAbertura: data.data_inicio_atividade,
        socios: data.qsa?.map((s: any) => ({
          nome: s.nome_socio,
          qualificacao: s.qualificacao_socio,
        })),
      };
    } catch (error) {
      enrichmentLogger.debug({ cnpj, error }, 'Brasil API lookup failed');
      return null;
    }
  }

  /**
   * Busca empresas por nome do sócio via Casa dos Dados
   * API pública que permite buscar CNPJs por nome de sócio
   */
  private async searchCasaDosDados(name: string): Promise<CnpjSearchResult> {
    try {
      // Casa dos Dados API - busca por sócio
      const encodedName = encodeURIComponent(name);
      const response = await fetch(
        `https://api.casadosdados.com.br/v2/public/cnpj/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: {
              termo: [],
              atividade_principal: [],
              natureza_juridica: [],
              uf: [],
              municipio: [],
              bairro: [],
              situacao_cadastral: 'ATIVA',
              cep: [],
              ddd: [],
            },
            extras: {
              somente_mei: false,
              excluir_mei: false,
              com_email: false,
              incluir_atividade_secundaria: false,
              com_contato_telefonico: false,
              somente_fixo: false,
              somente_celular: false,
              somente_matriz: false,
              somente_filial: false,
            },
            range_query: {
              data_abertura: { lte: null, gte: null },
              capital_social: { lte: null, gte: null },
            },
            // Busca pelo nome do sócio
            termo_socio: [name],
          }),
        }
      );

      if (!response.ok) {
        // Casa dos Dados pode ter rate limit ou estar indisponível
        if (response.status === 429 || response.status === 403) {
          enrichmentLogger.debug('Casa dos Dados rate limited or blocked');
          return { success: false, companies: [], error: 'Rate limited' };
        }
        return { success: false, companies: [], error: `HTTP ${response.status}` };
      }

      const data = await response.json();

      if (!data.data?.cnpj || data.data.cnpj.length === 0) {
        return { success: true, companies: [], source: 'casadosdados' };
      }

      const companies: CompanyInfo[] = data.data.cnpj.slice(0, 10).map((item: any) => ({
        cnpj: item.cnpj,
        razaoSocial: item.razao_social,
        nomeFantasia: item.nome_fantasia || undefined,
        situacao: item.situacao_cadastral,
        capitalSocial: item.capital_social,
        atividadePrincipal: item.atividade_principal?.descricao,
        municipio: item.municipio,
        uf: item.uf,
        dataAbertura: item.data_abertura,
        socios: item.socios?.map((s: any) => ({
          nome: s.nome,
          qualificacao: s.qualificacao,
        })),
      }));

      return {
        success: true,
        companies,
        source: 'casadosdados',
      };
    } catch (error) {
      enrichmentLogger.debug({ name, error }, 'Casa dos Dados search failed');
      return {
        success: false,
        companies: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Normaliza nome para busca
   */
  private normalizeName(name: string): string {
    return name
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^A-Z\s]/g, '') // Remove caracteres especiais
      .replace(/\s+/g, ' ') // Normaliza espaços
      .trim();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
