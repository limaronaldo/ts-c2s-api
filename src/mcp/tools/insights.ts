/**
 * MCP Tools - Web Insights
 * RML-994: Web intelligence and family connection detection
 *
 * Tools:
 * - generate_web_insights: Full insight generation with web search
 * - detect_family_connection: Detect family/wealth connections
 * - identify_notable_surname: Check for notable surnames (Safra, Lemann, etc)
 * - analyze_lead_name: Comprehensive name analysis
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";
import {
  analyzeFullName,
  detectFamilyConnection,
  detectConcatenatedName,
  isInternationalPhone,
} from "../../utils/surname-analyzer";

export const insightTools: Tool[] = [
  {
    name: "generate_web_insights",
    description:
      "Generate comprehensive insights for a lead using web search, CNPJ lookup, and surname analysis. Returns tier classification, family connections, business profile, and actionable recommendations.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: {
          type: "string",
          description: "C2S lead ID (optional - for sending insights to C2S)",
        },
        name: {
          type: "string",
          description: "Lead name",
        },
        enrichedName: {
          type: "string",
          description: "Name from CPF enrichment (if different from lead name)",
        },
        phone: {
          type: "string",
          description: "Phone number",
        },
        email: {
          type: "string",
          description: "Email address",
        },
        income: {
          type: "number",
          description: "Monthly income",
        },
        propertyCount: {
          type: "number",
          description: "Number of properties owned",
        },
        sendToC2S: {
          type: "boolean",
          description: "Whether to send insights to C2S (default: false)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "detect_family_connection",
    description:
      "Detect if two names indicate a family connection (spouse, sibling, parent/child). Useful when lead name differs from CPF holder name.",
    inputSchema: {
      type: "object",
      properties: {
        leadName: {
          type: "string",
          description: "Name provided by the lead",
        },
        enrichedName: {
          type: "string",
          description: "Name from CPF/enrichment data",
        },
      },
      required: ["leadName", "enrichedName"],
    },
  },
  {
    name: "identify_notable_surname",
    description:
      "Check if a name contains notable/wealthy family surnames (Safra, Lemann, Moreira Salles, etc). Returns family context and related notable people.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Full name to analyze",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "analyze_lead_name",
    description:
      "Comprehensive name analysis including surname rarity, notable family detection, concatenated name detection, and international phone check.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Lead name to analyze",
        },
        phone: {
          type: "string",
          description: "Phone number (optional - for international check)",
        },
      },
      required: ["name"],
    },
  },
];

export async function handleInsightTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "generate_web_insights": {
      const {
        leadId,
        name: leadName,
        enrichedName,
        phone,
        email,
        income,
        propertyCount,
        sendToC2S = false,
      } = args as {
        leadId?: string;
        name: string;
        enrichedName?: string;
        phone?: string;
        email?: string;
        income?: number;
        propertyCount?: number;
        sendToC2S?: boolean;
      };

      try {
        // Generate insights using the service
        const result = await container.webInsight.generateAndSendInsights(
          {
            leadId: sendToC2S && leadId ? leadId : "mcp-request",
            leadName,
            enrichedName,
            phone,
            email,
            income,
            propertyCount,
          },
          { sendToC2S: sendToC2S && !!leadId },
        );

        return {
          success: true,
          generated: result.generated,
          insightCount: result.insightCount,
          tier: result.tier,
          messageSent: result.messageSent,
          insights: result.insights?.map((i) => ({
            type: i.type,
            title: i.title,
            details: i.details,
            confidence: i.confidence,
            recommendation: i.recommendation,
            sources: i.sources,
          })),
          recommendation:
            result.tier === "platinum"
              ? "Ultra-high value lead - priority contact with premium approach"
              : result.tier === "gold"
                ? "High value lead - prioritize and personalize approach"
                : result.tier === "silver"
                  ? "Good potential - qualify interest and capacity"
                  : "Standard lead - follow normal process",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Insight generation failed",
        };
      }
    }

    case "detect_family_connection": {
      const { leadName, enrichedName } = args as {
        leadName: string;
        enrichedName: string;
      };

      const connection = detectFamilyConnection(leadName, enrichedName);

      if (connection.type === "none") {
        return {
          success: true,
          detected: false,
          leadName,
          enrichedName,
          message: "No family connection detected between names",
        };
      }

      let relationshipDescription: string;
      switch (connection.type) {
        case "spouse":
          relationshipDescription =
            "Likely spouse - different first names but shared surname";
          break;
        case "sibling":
          relationshipDescription =
            "Possibly siblings - shared surname, similar name patterns";
          break;
        case "parent_child":
          relationshipDescription =
            "Possibly parent/child - shared surname with generational indicators";
          break;
        default:
          relationshipDescription = "Related - shared surname detected";
      }

      return {
        success: true,
        detected: true,
        leadName,
        enrichedName,
        connection: {
          type: connection.type,
          sharedSurname: connection.sharedSurname,
          confidence: connection.confidence,
          description: relationshipDescription,
        },
        insight:
          "The lead may be using a family member's phone/contact. Consider this when making contact.",
      };
    }

    case "identify_notable_surname": {
      const { name: fullName } = args as { name: string };

      const analyses = analyzeFullName(fullName);

      const notableSurnames = analyses.filter((a) => a.isNotableFamily);
      const rareSurnames = analyses.filter(
        (a) => a.isRare && !a.isNotableFamily,
      );

      if (notableSurnames.length === 0 && rareSurnames.length === 0) {
        return {
          success: true,
          name: fullName,
          hasNotable: false,
          hasRare: false,
          message: "No notable or rare surnames detected",
          surnames: analyses.map((a) => ({
            surname: a.surname,
            isRare: a.isRare,
            isNotable: a.isNotableFamily,
            confidence: a.confidence,
          })),
        };
      }

      return {
        success: true,
        name: fullName,
        hasNotable: notableSurnames.length > 0,
        hasRare: rareSurnames.length > 0,
        notableFamilies: notableSurnames.map((a) => ({
          surname: a.surname,
          familyContext: a.familyContext,
          relatedPeople: a.relatedPeople,
          confidence: a.confidence,
        })),
        rareSurnames: rareSurnames.map((a) => ({
          surname: a.surname,
          confidence: a.confidence,
        })),
        recommendation:
          notableSurnames.length > 0
            ? "High-value indicator: Notable family surname detected. Prioritize with premium approach."
            : "Rare surname detected - may indicate unique background or heritage.",
      };
    }

    case "analyze_lead_name": {
      const { name: fullName, phone } = args as {
        name: string;
        phone?: string;
      };

      // Surname analysis
      const surnameAnalyses = analyzeFullName(fullName);

      // Concatenated name check
      const concatenatedCheck = detectConcatenatedName(fullName);

      // International phone check
      const internationalCheck = phone
        ? isInternationalPhone(phone)
        : { isInternational: false };

      // Compile findings
      const findings: string[] = [];

      const notableSurnames = surnameAnalyses.filter((a) => a.isNotableFamily);
      const rareSurnames = surnameAnalyses.filter(
        (a) => a.isRare && !a.isNotableFamily,
      );

      if (notableSurnames.length > 0) {
        findings.push(
          `Notable family: ${notableSurnames.map((a) => a.familyContext).join(", ")}`,
        );
      }

      if (rareSurnames.length > 0) {
        findings.push(`Rare surname(s): ${rareSurnames.map((a) => a.surname).join(", ")}`);
      }

      if (concatenatedCheck.detected) {
        findings.push(
          `Concatenated name detected: ${concatenatedCheck.firstName} ${concatenatedCheck.lastName}`,
        );
      }

      if (internationalCheck.isInternational) {
        findings.push(`International phone: ${internationalCheck.country || "Unknown country"}`);
      }

      return {
        success: true,
        name: fullName,
        phone: phone || null,
        analysis: {
          surnames: surnameAnalyses.map((a) => ({
            surname: a.surname,
            isRare: a.isRare,
            isNotable: a.isNotableFamily,
            familyContext: a.familyContext,
            confidence: a.confidence,
          })),
          concatenatedName: concatenatedCheck.detected
            ? {
                detected: true,
                firstName: concatenatedCheck.firstName,
                lastName: concatenatedCheck.lastName,
                confidence: concatenatedCheck.confidence,
              }
            : { detected: false },
          international: internationalCheck.isInternational
            ? {
                detected: true,
                country: internationalCheck.country,
              }
            : { detected: false },
        },
        findings,
        hasHighValueIndicators:
          notableSurnames.length > 0 || internationalCheck.isInternational,
        recommendation:
          findings.length > 0
            ? `Interesting lead profile: ${findings.join("; ")}`
            : "Standard name profile - no special indicators detected",
      };
    }

    default:
      throw new Error(`Unknown insight tool: ${name}`);
  }
}
