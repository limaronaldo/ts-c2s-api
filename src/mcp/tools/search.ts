/**
 * MCP Tools - Web Search
 * RML-996: Web search for lead research
 *
 * Tools:
 * - search_web: General web search
 * - search_news: Search news about person/company
 * - find_linkedin_profile: Find LinkedIn profile
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";

export const searchTools: Tool[] = [
  {
    name: "search_web",
    description:
      "Search the web for information about a person or company. Uses Google Custom Search API. Returns relevant results with titles, URLs, and snippets.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query",
        },
        numResults: {
          type: "number",
          description: "Number of results to return (max 10, default 5)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_person",
    description:
      "Search for information about a specific person. Searches for LinkedIn profile, business connections, and professional background.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Person's full name",
        },
        location: {
          type: "string",
          description: "Location to narrow search (optional)",
        },
        company: {
          type: "string",
          description: "Company name to narrow search (optional)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "search_news",
    description:
      "Search for news articles about a person or company. Checks major Brazilian news sources. Flags negative news (investigations, legal issues, etc).",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Name or company to search for",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "find_linkedin_profile",
    description:
      "Search for a person's LinkedIn profile. Returns profile URL and extracted info (role, company, education if available).",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Person's full name",
        },
        company: {
          type: "string",
          description: "Current or recent company (helps narrow search)",
        },
      },
      required: ["name"],
    },
  },
];

export async function handleSearchTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  // Check quota first
  const quotaRemaining = container.webSearch.getQuotaRemaining();

  switch (name) {
    case "search_web": {
      const { query, numResults = 5 } = args as {
        query: string;
        numResults?: number;
      };

      if (quotaRemaining <= 0) {
        return {
          success: false,
          error: "Google API daily quota exhausted. Try again tomorrow.",
          quotaRemaining: 0,
        };
      }

      try {
        const results = await container.webSearch.searchGoogle(
          query,
          Math.min(numResults, 10),
        );

        return {
          success: true,
          query,
          count: results.length,
          quotaRemaining: container.webSearch.getQuotaRemaining(),
          results: results.map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
          })),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Search failed",
        };
      }
    }

    case "search_person": {
      const { name: personName, location, company } = args as {
        name: string;
        location?: string;
        company?: string;
      };

      if (quotaRemaining < 3) {
        return {
          success: false,
          error: "Insufficient Google API quota for person search (requires 3 queries).",
          quotaRemaining,
        };
      }

      try {
        const locationStr = location || "São Paulo";
        const results = await container.webSearch.searchPerson(
          personName,
          locationStr,
        );

        // Try to find LinkedIn specifically
        const linkedInResult = results.find((r) =>
          r.url.includes("linkedin.com/in"),
        );

        // Try to find company mentions
        const companyMentions = results.filter(
          (r) =>
            r.snippet.toLowerCase().includes("sócio") ||
            r.snippet.toLowerCase().includes("diretor") ||
            r.snippet.toLowerCase().includes("ceo") ||
            r.snippet.toLowerCase().includes("fundador"),
        );

        return {
          success: true,
          name: personName,
          location: locationStr,
          company: company || null,
          count: results.length,
          quotaRemaining: container.webSearch.getQuotaRemaining(),
          linkedIn: linkedInResult
            ? {
                url: linkedInResult.url,
                snippet: linkedInResult.snippet,
              }
            : null,
          businessMentions: companyMentions.length,
          results: results.slice(0, 10).map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
          })),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Search failed",
        };
      }
    }

    case "search_news": {
      const { query } = args as { query: string };

      if (quotaRemaining <= 0) {
        return {
          success: false,
          error: "Google API daily quota exhausted. Try again tomorrow.",
          quotaRemaining: 0,
        };
      }

      try {
        const results = await container.webSearch.searchNews(query);

        const negativeResults = results.filter((r) => r.isNegative);
        const positiveResults = results.filter((r) => !r.isNegative);

        return {
          success: true,
          query,
          count: results.length,
          quotaRemaining: container.webSearch.getQuotaRemaining(),
          hasNegativeNews: negativeResults.length > 0,
          negativeCount: negativeResults.length,
          summary: {
            totalArticles: results.length,
            negativeArticles: negativeResults.length,
            positiveOrNeutral: positiveResults.length,
            riskLevel:
              negativeResults.length >= 3
                ? "high"
                : negativeResults.length >= 1
                  ? "medium"
                  : "low",
          },
          negativeNews: negativeResults.map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
            keywords: r.keywords,
          })),
          otherNews: positiveResults.slice(0, 5).map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
          })),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Search failed",
        };
      }
    }

    case "find_linkedin_profile": {
      const { name: personName, company } = args as {
        name: string;
        company?: string;
      };

      if (quotaRemaining <= 0) {
        return {
          success: false,
          error: "Google API daily quota exhausted. Try again tomorrow.",
          quotaRemaining: 0,
        };
      }

      try {
        const profile = await container.webSearch.searchLinkedIn(
          personName,
          company,
        );

        if (!profile) {
          return {
            success: true,
            found: false,
            name: personName,
            company: company || null,
            quotaRemaining: container.webSearch.getQuotaRemaining(),
            message: "LinkedIn profile not found",
          };
        }

        return {
          success: true,
          found: true,
          name: personName,
          quotaRemaining: container.webSearch.getQuotaRemaining(),
          profile: {
            url: profile.linkedInUrl,
            role: profile.role,
            company: profile.company,
            education: profile.education,
            bio: profile.bio,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Search failed",
        };
      }
    }

    default:
      throw new Error(`Unknown search tool: ${name}`);
  }
}
