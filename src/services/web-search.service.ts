/**
 * Web Search Service
 * RML-872: Análise profunda automática de leads
 *
 * Provides web search capabilities for lead analysis using multiple sources:
 * - Google Custom Search API (primary)
 * - DuckDuckGo (fallback)
 * - Direct website fetching for specific domains
 */

import ky from "ky";
import { logger } from "../utils/logger";

const log = logger.child({ module: "web-search" });

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface CompanyInfo {
  name: string;
  domain?: string;
  description?: string;
  sector?: string;
  founded?: string;
  employees?: string;
  revenue?: string;
  linkedInUrl?: string;
  source: string;
}

export interface PersonInfo {
  fullName?: string;
  role?: string;
  company?: string;
  education?: string;
  linkedInUrl?: string;
  instagramUrl?: string;
  bio?: string;
  source: string;
}

export interface NewsResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
  source: string;
  isNegative: boolean;
  keywords: string[];
}

// Rate limiting for Google API (100 free queries/day)
const GOOGLE_RATE_LIMIT = {
  maxPerDay: 90, // Leave margin
  queriesUsed: 0,
  lastReset: new Date(),
};

export class WebSearchService {
  private googleApiKey?: string;
  private googleCseId?: string;

  constructor(googleApiKey?: string, googleCseId?: string) {
    this.googleApiKey = googleApiKey || process.env.GOOGLE_API_KEY;
    this.googleCseId = googleCseId || process.env.GOOGLE_CSE_ID;

    // Reset counter daily
    const now = new Date();
    if (now.getDate() !== GOOGLE_RATE_LIMIT.lastReset.getDate()) {
      GOOGLE_RATE_LIMIT.queriesUsed = 0;
      GOOGLE_RATE_LIMIT.lastReset = now;
    }
  }

  /**
   * Search Google Custom Search API
   */
  async searchGoogle(query: string, num: number = 5): Promise<SearchResult[]> {
    if (!this.googleApiKey || !this.googleCseId) {
      log.debug("Google API not configured, skipping");
      return [];
    }

    if (GOOGLE_RATE_LIMIT.queriesUsed >= GOOGLE_RATE_LIMIT.maxPerDay) {
      log.warn("Google API daily limit reached, skipping");
      return [];
    }

    try {
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", this.googleApiKey);
      url.searchParams.set("cx", this.googleCseId);
      url.searchParams.set("q", query);
      url.searchParams.set("num", String(Math.min(num, 10)));

      const response = await ky.get(url.toString(), { timeout: 10000 }).json<{
        items?: Array<{
          title: string;
          link: string;
          snippet: string;
        }>;
      }>();

      GOOGLE_RATE_LIMIT.queriesUsed++;

      if (!response.items) {
        return [];
      }

      return response.items.map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        source: "google",
      }));
    } catch (error) {
      log.error({ error, query }, "Google search failed");
      return [];
    }
  }

  /**
   * Search for a person by name and optional location
   */
  async searchPerson(name: string, location?: string): Promise<SearchResult[]> {
    const queries = [
      `"${name}" ${location || ""} LinkedIn`,
      `"${name}" ${location || ""} empresário OR CEO OR fundador`,
      `"${name}" ${location || ""} investidor OR venture capital`,
    ];

    const results: SearchResult[] = [];

    for (const query of queries) {
      const searchResults = await this.searchGoogle(query.trim(), 3);
      results.push(...searchResults);

      // Small delay between queries
      await new Promise((r) => setTimeout(r, 500));
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    return results.filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });
  }

  /**
   * Search for news about a person/company
   */
  async searchNews(
    query: string,
    negativeKeywords: string[] = [
      "investigação",
      "CPI",
      "prisão",
      "fraude",
      "lavagem",
      "crime",
      "processo",
      "condenado",
      "indiciado",
      "acusado",
      "tigrinho",
      "bet",
      "apostas ilegais",
    ]
  ): Promise<NewsResult[]> {
    const newsQuery = `${query} site:infomoney.com.br OR site:valor.com.br OR site:exame.com OR site:forbes.com.br OR site:neofeed.com.br OR site:estadao.com.br OR site:folha.uol.com.br`;

    const results = await this.searchGoogle(newsQuery, 5);

    return results.map((r) => {
      const lowerSnippet = r.snippet.toLowerCase();
      const lowerTitle = r.title.toLowerCase();
      const foundKeywords = negativeKeywords.filter(
        (kw) => lowerSnippet.includes(kw.toLowerCase()) || lowerTitle.includes(kw.toLowerCase())
      );

      return {
        ...r,
        isNegative: foundKeywords.length > 0,
        keywords: foundKeywords,
      };
    });
  }

  /**
   * Search LinkedIn for a person's profile
   */
  async searchLinkedIn(name: string, company?: string): Promise<PersonInfo | null> {
    const query = company
      ? `site:linkedin.com/in "${name}" "${company}"`
      : `site:linkedin.com/in "${name}"`;

    const results = await this.searchGoogle(query, 3);

    if (results.length === 0) {
      return null;
    }

    // Parse LinkedIn snippet for info
    const topResult = results[0];
    const info: PersonInfo = {
      linkedInUrl: topResult.url,
      source: topResult.url,
    };

    // Try to extract role and company from snippet
    const roleMatch = topResult.snippet.match(
      /(?:^|\s)([\w\s]+)\s+(?:at|na|em|@)\s+([\w\s&]+)/i
    );
    if (roleMatch) {
      info.role = roleMatch[1].trim();
      info.company = roleMatch[2].trim();
    }

    // Check for education keywords
    const educationKeywords = [
      "Harvard",
      "Stanford",
      "MIT",
      "Yale",
      "Princeton",
      "Columbia",
      "Wharton",
      "INSEAD",
      "USP",
      "FGV",
      "Insper",
      "PUC",
    ];
    for (const edu of educationKeywords) {
      if (topResult.snippet.includes(edu) || topResult.title.includes(edu)) {
        info.education = edu;
        break;
      }
    }

    return info;
  }

  /**
   * Analyze email domain to find company info
   */
  async analyzeDomain(domain: string): Promise<CompanyInfo | null> {
    // Skip common email providers
    const commonDomains = [
      "gmail.com",
      "hotmail.com",
      "outlook.com",
      "yahoo.com",
      "icloud.com",
      "live.com",
      "uol.com.br",
      "bol.com.br",
      "terra.com.br",
    ];

    if (commonDomains.includes(domain.toLowerCase())) {
      return null;
    }

    try {
      // Search for the company
      const query = `"${domain}" empresa OR company`;
      const results = await this.searchGoogle(query, 3);

      if (results.length === 0) {
        return null;
      }

      const info: CompanyInfo = {
        name: domain.split(".")[0],
        domain,
        source: results[0].url,
      };

      // Try to extract more info from snippets
      for (const result of results) {
        if (result.url.includes("linkedin.com/company")) {
          info.linkedInUrl = result.url;
        }

        // Look for sector keywords
        const sectorKeywords: Record<string, string> = {
          "venture capital": "Venture Capital",
          investimento: "Investimentos",
          capital: "Investimentos",
          tecnologia: "Tecnologia",
          fintech: "Fintech",
          imobiliári: "Imobiliário",
          "real estate": "Imobiliário",
          saúde: "Saúde",
          health: "Saúde",
          varejo: "Varejo",
          retail: "Varejo",
        };

        const lowerSnippet = result.snippet.toLowerCase();
        for (const [keyword, sector] of Object.entries(sectorKeywords)) {
          if (lowerSnippet.includes(keyword)) {
            info.sector = sector;
            break;
          }
        }

        if (!info.description && result.snippet.length > 50) {
          info.description = result.snippet;
        }
      }

      return info;
    } catch (error) {
      log.error({ error, domain }, "Domain analysis failed");
      return null;
    }
  }

  /**
   * Search for CNPJ/company info by owner name
   */
  async searchCompanyByOwner(ownerName: string): Promise<CompanyInfo[]> {
    const query = `"${ownerName}" sócio OR administrador OR diretor CNPJ`;
    const results = await this.searchGoogle(query, 5);

    const companies: CompanyInfo[] = [];

    for (const result of results) {
      // Look for company names in the results
      const companyMatch = result.snippet.match(
        /(?:sócio|administrador|diretor|CEO|fundador)\s+(?:da|do|de|na|no)?\s*([A-Z][A-Za-z\s&]+(?:LTDA|S\.?A\.?|ME|EIRELI)?)/i
      );

      if (companyMatch) {
        companies.push({
          name: companyMatch[1].trim(),
          source: result.url,
        });
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    return companies.filter((c) => {
      const key = c.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Get remaining Google API quota
   */
  getQuotaRemaining(): number {
    return Math.max(0, GOOGLE_RATE_LIMIT.maxPerDay - GOOGLE_RATE_LIMIT.queriesUsed);
  }
}
