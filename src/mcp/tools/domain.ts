/**
 * MCP Tools - Domain Analyzer
 * RML-992: Email domain analysis for lead qualification
 *
 * Tools:
 * - analyze_email_domain: Full domain analysis from email
 * - get_domain_trust_score: Quick trust score (0-100)
 * - identify_company_from_email: Identify company from email domain
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";
import { DomainAnalyzerService } from "../../services/domain-analyzer.service";

export const domainTools: Tool[] = [
  {
    name: "analyze_email_domain",
    description:
      "Analyze an email domain to determine if it's personal or business, identify the company, sector, and calculate a trust score. Returns detailed insights about the domain owner.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Email address to analyze (e.g., john@company.com)",
        },
      },
      required: ["email"],
    },
  },
  {
    name: "get_domain_trust_score",
    description:
      "Get a quick trust score (0-100) for an email domain. Higher scores indicate more trustworthy/valuable domains (corporate, known companies). Personal emails (gmail, hotmail) score lower.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Email address to check",
        },
      },
      required: ["email"],
    },
  },
  {
    name: "identify_company_from_email",
    description:
      "Identify company information from an email domain. Searches known companies database and web for company name, sector, LinkedIn, and description.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Email address to lookup company",
        },
      },
      required: ["email"],
    },
  },
];

export async function handleDomainTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "analyze_email_domain": {
      const { email } = args as { email: string };

      if (!email || !email.includes("@")) {
        return {
          success: false,
          error: "Invalid email format",
        };
      }

      try {
        const analysis = await container.domainAnalyzer.analyzeDomain(email);

        return {
          success: true,
          email,
          domain: analysis.domain,
          analysis: {
            isPersonalEmail: analysis.isPersonalEmail,
            isBusinessEmail: analysis.isBusinessEmail,
            trustScore: analysis.trustScore,
            insights: analysis.insights,
          },
          company: analysis.companyInfo
            ? {
                name: analysis.companyInfo.name,
                sector: analysis.companyInfo.sector,
                description: analysis.companyInfo.description,
                linkedIn: analysis.companyInfo.linkedInUrl,
              }
            : null,
          recommendation:
            analysis.trustScore >= 70
              ? "High-value lead - corporate email from known company"
              : analysis.trustScore >= 50
                ? "Potential business lead - verify company details"
                : "Personal email - lower priority unless other indicators present",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Analysis failed",
        };
      }
    }

    case "get_domain_trust_score": {
      const { email } = args as { email: string };

      if (!email || !email.includes("@")) {
        return {
          success: false,
          error: "Invalid email format",
        };
      }

      try {
        const analysis = await container.domainAnalyzer.analyzeDomain(email);
        const domain = DomainAnalyzerService.extractDomain(email);

        return {
          success: true,
          email,
          domain,
          trustScore: analysis.trustScore,
          level:
            analysis.trustScore >= 80
              ? "high"
              : analysis.trustScore >= 50
                ? "medium"
                : "low",
          isPersonal: analysis.isPersonalEmail,
          isBusiness: analysis.isBusinessEmail,
          isHighValue: DomainAnalyzerService.isHighValueDomain(domain || ""),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Lookup failed",
        };
      }
    }

    case "identify_company_from_email": {
      const { email } = args as { email: string };

      if (!email || !email.includes("@")) {
        return {
          success: false,
          error: "Invalid email format",
        };
      }

      const domain = DomainAnalyzerService.extractDomain(email);
      if (!domain) {
        return {
          success: false,
          error: "Could not extract domain from email",
        };
      }

      try {
        const analysis = await container.domainAnalyzer.analyzeDomain(email);

        if (analysis.isPersonalEmail) {
          return {
            success: true,
            found: false,
            domain,
            message: "Personal email domain - no company associated",
            sectorHint: DomainAnalyzerService.getSectorHint(domain),
          };
        }

        if (!analysis.companyInfo) {
          return {
            success: true,
            found: false,
            domain,
            message: "Business domain but company not identified",
            sectorHint: DomainAnalyzerService.getSectorHint(domain),
          };
        }

        return {
          success: true,
          found: true,
          domain,
          company: {
            name: analysis.companyInfo.name,
            sector: analysis.companyInfo.sector,
            description: analysis.companyInfo.description,
            linkedIn: analysis.companyInfo.linkedInUrl,
            source: analysis.companyInfo.source,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Lookup failed",
        };
      }
    }

    default:
      throw new Error(`Unknown domain tool: ${name}`);
  }
}
