/**
 * Domain Analyzer Service
 * RML-872: Análise profunda automática de leads
 *
 * Analyzes email domains to identify company information and assess lead quality.
 */

import { logger } from "../utils/logger";
import { WebSearchService, type CompanyInfo } from "./web-search.service";

const log = logger.child({ module: "domain-analyzer" });

export interface DomainAnalysis {
  domain: string;
  isPersonalEmail: boolean;
  isBusinessEmail: boolean;
  companyInfo?: CompanyInfo;
  domainAge?: string;
  trustScore: number; // 0-100
  insights: string[];
}

// Known domains with pre-analyzed info
const KNOWN_DOMAINS: Record<string, Partial<CompanyInfo>> = {
  // Investment firms
  "allievocapital.com": {
    name: "Allievo Capital",
    sector: "Venture Capital",
    description: "Private Equity firm focada em Venture Capital e Search Funds",
  },
  "softbank.com": {
    name: "SoftBank",
    sector: "Venture Capital",
    description: "Conglomerado japonês de investimentos em tecnologia",
  },
  "a16z.com": {
    name: "Andreessen Horowitz",
    sector: "Venture Capital",
    description: "Um dos maiores VCs do mundo",
  },
  // Banks
  "itau.com.br": {
    name: "Itaú Unibanco",
    sector: "Banco",
    description: "Maior banco privado do Brasil",
  },
  "bradesco.com.br": {
    name: "Bradesco",
    sector: "Banco",
    description: "Um dos maiores bancos do Brasil",
  },
  "btgpactual.com": {
    name: "BTG Pactual",
    sector: "Banco de Investimentos",
    description: "Maior banco de investimentos da América Latina",
  },
  "xpi.com.br": {
    name: "XP Investimentos",
    sector: "Corretora",
    description: "Maior corretora independente do Brasil",
  },
  // Tech companies
  "google.com": {
    name: "Google",
    sector: "Tecnologia",
    description: "Big Tech americana",
  },
  "microsoft.com": {
    name: "Microsoft",
    sector: "Tecnologia",
    description: "Big Tech americana",
  },
  "amazon.com": {
    name: "Amazon",
    sector: "E-commerce/Cloud",
    description: "Big Tech americana",
  },
  // Real estate
  "mbras.com.br": {
    name: "MBRAS",
    sector: "Imobiliário",
    description: "Imobiliária de alto padrão em São Paulo",
  },
  "lopes.com.br": {
    name: "Lopes",
    sector: "Imobiliário",
    description: "Uma das maiores imobiliárias do Brasil",
  },
};

// Personal email domains
const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "yahoo.com.br",
  "icloud.com",
  "live.com",
  "msn.com",
  "uol.com.br",
  "bol.com.br",
  "terra.com.br",
  "globo.com",
  "ig.com.br",
  "r7.com",
  "protonmail.com",
  "pm.me",
  "tutanota.com",
  "zoho.com",
]);

// High-trust domain patterns (regex)
const HIGH_TRUST_PATTERNS = [
  /\.gov\.br$/,
  /\.edu\.br$/,
  /\.edu$/,
  /\.org\.br$/,
  /\.mil\.br$/,
  /bank/i,
  /capital/i,
  /invest/i,
  /ventures/i,
];

export class DomainAnalyzerService {
  private webSearchService: WebSearchService;

  constructor(webSearchService?: WebSearchService) {
    this.webSearchService = webSearchService || new WebSearchService();
  }

  /**
   * Analyze an email domain
   */
  async analyzeDomain(email: string): Promise<DomainAnalysis> {
    const domain = email.split("@")[1]?.toLowerCase();

    if (!domain) {
      return {
        domain: "",
        isPersonalEmail: true,
        isBusinessEmail: false,
        trustScore: 0,
        insights: ["Email inválido"],
      };
    }

    const analysis: DomainAnalysis = {
      domain,
      isPersonalEmail: PERSONAL_DOMAINS.has(domain),
      isBusinessEmail: !PERSONAL_DOMAINS.has(domain),
      trustScore: 50,
      insights: [],
    };

    // Check known domains first
    if (KNOWN_DOMAINS[domain]) {
      analysis.companyInfo = {
        ...KNOWN_DOMAINS[domain],
        domain,
        source: "known_database",
      } as CompanyInfo;
      analysis.trustScore = 90;
      analysis.insights.push(`Domínio conhecido: ${analysis.companyInfo.name}`);

      if (analysis.companyInfo.sector) {
        analysis.insights.push(`Setor: ${analysis.companyInfo.sector}`);
      }

      return analysis;
    }

    // Personal email
    if (analysis.isPersonalEmail) {
      analysis.trustScore = 30;
      analysis.insights.push("Email pessoal - sem informação de empresa");
      return analysis;
    }

    // Check high-trust patterns
    for (const pattern of HIGH_TRUST_PATTERNS) {
      if (pattern.test(domain)) {
        analysis.trustScore = 80;
        analysis.insights.push("Domínio de alta confiança");
        break;
      }
    }

    // Search for company info
    try {
      const companyInfo = await this.webSearchService.analyzeDomain(domain);
      if (companyInfo) {
        analysis.companyInfo = companyInfo;
        analysis.trustScore = Math.max(analysis.trustScore, 70);
        analysis.insights.push(`Empresa identificada: ${companyInfo.name}`);

        if (companyInfo.sector) {
          analysis.insights.push(`Setor: ${companyInfo.sector}`);
        }

        if (companyInfo.linkedInUrl) {
          analysis.insights.push("Perfil LinkedIn encontrado");
          analysis.trustScore = Math.min(100, analysis.trustScore + 10);
        }
      } else {
        analysis.insights.push("Empresa não encontrada via web search");
      }
    } catch (error) {
      log.error({ error, domain }, "Failed to search domain");
      analysis.insights.push("Erro ao buscar informações da empresa");
    }

    return analysis;
  }

  /**
   * Extract domain from email
   */
  static extractDomain(email: string): string | null {
    const match = email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * Check if email is from a known high-value company
   */
  static isHighValueDomain(domain: string): boolean {
    const highValueSectors = ["Venture Capital", "Banco", "Banco de Investimentos", "Private Equity"];
    const known = KNOWN_DOMAINS[domain.toLowerCase()];
    return known?.sector !== undefined && highValueSectors.includes(known.sector);
  }

  /**
   * Get sector hint from domain name
   */
  static getSectorHint(domain: string): string | null {
    const hints: Record<string, string> = {
      capital: "Investimentos",
      invest: "Investimentos",
      ventures: "Venture Capital",
      bank: "Banco",
      banco: "Banco",
      imob: "Imobiliário",
      realty: "Imobiliário",
      constru: "Construção",
      tech: "Tecnologia",
      fin: "Fintech",
      health: "Saúde",
      saude: "Saúde",
      edu: "Educação",
      law: "Jurídico",
      adv: "Jurídico",
    };

    const lowerDomain = domain.toLowerCase();
    for (const [keyword, sector] of Object.entries(hints)) {
      if (lowerDomain.includes(keyword)) {
        return sector;
      }
    }
    return null;
  }
}
