/**
 * Google Custom Search Service - Pesquisa web para insights de leads
 *
 * Usa Google Custom Search API para descobrir informações públicas:
 * - Perfil profissional (LinkedIn, empresas)
 * - Notícias e menções em mídia
 * - Processos judiciais públicos
 * - Redes sociais
 *
 * Limite gratuito: 100 queries/dia
 * Custo adicional: $5/1000 queries
 */

import { enrichmentLogger } from '../utils/logger';
import { getConfig } from '../config';

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  source: string; // linkedin, escavador, jusbrasil, etc
}

export interface GoogleSearchResult {
  success: boolean;
  results: SearchResult[];
  totalResults?: number;
  error?: string;
}

export interface PersonInsightFromSearch {
  linkedinProfile?: string;
  companies?: string[];
  newsArticles?: Array<{ title: string; source: string; link: string }>;
  legalMentions?: Array<{ title: string; link: string }>;
  socialProfiles?: Array<{ platform: string; link: string }>;
  summary?: string;
}

// Rate limiter para Google API (100/dia = ~4/hora para ser seguro)
class DailyRateLimiter {
  private count: number = 0;
  private resetDate: string;
  private maxDaily: number;

  constructor(maxDaily: number) {
    this.maxDaily = maxDaily;
    this.resetDate = this.getTodayString();
  }

  private getTodayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  canMakeRequest(): boolean {
    const today = this.getTodayString();
    if (today !== this.resetDate) {
      this.count = 0;
      this.resetDate = today;
    }
    return this.count < this.maxDaily;
  }

  recordRequest(): void {
    this.count++;
  }

  getRemainingQuota(): number {
    return Math.max(0, this.maxDaily - this.count);
  }
}

export class GoogleSearchService {
  private apiKey: string | undefined;
  private cseId: string | undefined;
  private enabled: boolean;
  private rateLimiter: DailyRateLimiter;
  private baseUrl = 'https://www.googleapis.com/customsearch/v1';

  constructor() {
    const config = getConfig();
    this.apiKey = config.GOOGLE_API_KEY;
    this.cseId = config.GOOGLE_CSE_ID;
    this.enabled = !!(this.apiKey && this.cseId);
    // Limite: 90/dia (de 100 grátis)
    this.rateLimiter = new DailyRateLimiter(90);

    if (!this.enabled) {
      enrichmentLogger.debug('Google Search disabled: missing API key or CSE ID');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getRemainingQuota(): number {
    return this.rateLimiter.getRemainingQuota();
  }

  /**
   * Pesquisa genérica no Google
   */
  async search(query: string, numResults: number = 5): Promise<GoogleSearchResult> {
    if (!this.enabled) {
      return { success: false, results: [], error: 'Google Search not configured' };
    }

    if (!this.rateLimiter.canMakeRequest()) {
      enrichmentLogger.warn('Google Search daily quota exceeded');
      return { success: false, results: [], error: 'Daily quota exceeded' };
    }

    try {
      const params = new URLSearchParams({
        key: this.apiKey!,
        cx: this.cseId!,
        q: query,
        num: Math.min(numResults, 10).toString(),
        lr: 'lang_pt', // Prioriza resultados em português
        gl: 'br', // Resultados do Brasil
      });

      const response = await fetch(`${this.baseUrl}?${params}`);

      if (!response.ok) {
        if (response.status === 429) {
          enrichmentLogger.warn('Google Search rate limited');
          return { success: false, results: [], error: 'Rate limited' };
        }
        if (response.status === 403) {
          enrichmentLogger.error('Google Search API key invalid or quota exceeded');
          return { success: false, results: [], error: 'API key invalid' };
        }
        return { success: false, results: [], error: `HTTP ${response.status}` };
      }

      this.rateLimiter.recordRequest();
      const data = await response.json();

      const results: SearchResult[] = (data.items || []).map((item: any) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        source: this.extractSource(item.link),
      }));

      return {
        success: true,
        results,
        totalResults: parseInt(data.searchInformation?.totalResults || '0', 10),
      };
    } catch (error) {
      enrichmentLogger.error({ query, error }, 'Google Search failed');
      return {
        success: false,
        results: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Pesquisa informações sobre uma pessoa
   */
  async searchPerson(name: string, location?: string): Promise<PersonInsightFromSearch> {
    const insights: PersonInsightFromSearch = {};

    // Normaliza o nome para busca
    const normalizedName = this.normalizeName(name);
    const locationSuffix = location ? ` ${location}` : ' São Paulo';

    // Busca 1: LinkedIn + perfil profissional
    const linkedinResults = await this.search(
      `"${normalizedName}" site:linkedin.com/in`,
      3
    );
    if (linkedinResults.success && linkedinResults.results.length > 0) {
      const linkedinResult = linkedinResults.results.find((r) =>
        r.link.includes('linkedin.com/in/')
      );
      if (linkedinResult) {
        insights.linkedinProfile = linkedinResult.link;
      }
    }

    // Busca 2: Empresas e negócios
    const businessResults = await this.search(
      `"${normalizedName}" empresa OR empresário OR sócio OR CEO OR diretor${locationSuffix}`,
      5
    );
    if (businessResults.success && businessResults.results.length > 0) {
      insights.companies = this.extractCompanyMentions(businessResults.results);

      // Extrai notícias relevantes
      insights.newsArticles = businessResults.results
        .filter((r) => this.isNewsSource(r.source))
        .slice(0, 3)
        .map((r) => ({
          title: r.title,
          source: r.source,
          link: r.link,
        }));
    }

    // Busca 3: Menções legais (Escavador, JusBrasil)
    const legalResults = await this.search(
      `"${normalizedName}" site:escavador.com OR site:jusbrasil.com.br`,
      3
    );
    if (legalResults.success && legalResults.results.length > 0) {
      insights.legalMentions = legalResults.results.slice(0, 2).map((r) => ({
        title: r.title,
        link: r.link,
      }));
    }

    // Gera resumo se encontrou informações relevantes
    if (Object.keys(insights).length > 0) {
      insights.summary = this.generateSummary(insights);
    }

    return insights;
  }

  /**
   * Extrai o domínio/fonte de uma URL
   */
  private extractSource(url: string): string {
    try {
      const hostname = new URL(url).hostname.replace('www.', '');

      // Mapeamento de domínios conhecidos
      const sourceMap: Record<string, string> = {
        'linkedin.com': 'LinkedIn',
        'escavador.com': 'Escavador',
        'jusbrasil.com.br': 'JusBrasil',
        'instagram.com': 'Instagram',
        'facebook.com': 'Facebook',
        'twitter.com': 'Twitter',
        'x.com': 'Twitter/X',
        'forbes.com.br': 'Forbes Brasil',
        'exame.com': 'Exame',
        'infomoney.com.br': 'InfoMoney',
        'valor.globo.com': 'Valor Econômico',
        'estadao.com.br': 'Estadão',
        'folha.uol.com.br': 'Folha',
        'g1.globo.com': 'G1',
        'uol.com.br': 'UOL',
        'metropoles.com': 'Metrópoles',
        'caras.uol.com.br': 'Caras',
      };

      return sourceMap[hostname] || hostname;
    } catch {
      return 'web';
    }
  }

  /**
   * Verifica se é fonte de notícias
   */
  private isNewsSource(source: string): boolean {
    const newsSources = [
      'Forbes Brasil', 'Exame', 'InfoMoney', 'Valor Econômico',
      'Estadão', 'Folha', 'G1', 'UOL', 'Metrópoles', 'Caras',
    ];
    return newsSources.includes(source);
  }

  /**
   * Extrai menções de empresas dos resultados
   */
  private extractCompanyMentions(results: SearchResult[]): string[] {
    const companies: Set<string> = new Set();

    for (const result of results) {
      // Padrões comuns de menção de empresa
      const patterns = [
        /(?:CEO|diretor|sócio|fundador|presidente)\s+(?:da|do|de)\s+([A-Z][A-Za-záàâãéèêíïóôõöúçñ\s]+?)(?:\.|,|$)/gi,
        /([A-Z][A-Za-záàâãéèêíïóôõöúçñ]+(?:\s+[A-Z][A-Za-záàâãéèêíïóôõöúçñ]+)*)\s+(?:S\.?A\.?|Ltda|LTDA|S\/A)/gi,
      ];

      for (const pattern of patterns) {
        const matches = result.snippet.matchAll(pattern);
        for (const match of matches) {
          if (match[1] && match[1].length > 3 && match[1].length < 50) {
            companies.add(match[1].trim());
          }
        }
      }
    }

    return Array.from(companies).slice(0, 5);
  }

  /**
   * Normaliza nome para busca
   */
  private normalizeName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Gera resumo das informações encontradas
   */
  private generateSummary(insights: PersonInsightFromSearch): string {
    const parts: string[] = [];

    if (insights.linkedinProfile) {
      parts.push('Perfil LinkedIn encontrado');
    }

    if (insights.companies && insights.companies.length > 0) {
      parts.push(`Mencionado em ${insights.companies.length} empresa(s)`);
    }

    if (insights.newsArticles && insights.newsArticles.length > 0) {
      const sources = insights.newsArticles.map((a) => a.source).join(', ');
      parts.push(`Mencionado em: ${sources}`);
    }

    if (insights.legalMentions && insights.legalMentions.length > 0) {
      parts.push('Registros públicos encontrados');
    }

    return parts.join('. ');
  }
}
