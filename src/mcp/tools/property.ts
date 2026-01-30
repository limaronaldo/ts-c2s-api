/**
 * Property Intelligence MCP Tools
 * RML-987: Query IBVI property ownership data
 *
 * Tools:
 * - get_properties_by_cpf: Find all properties owned by a CPF
 * - get_property_summary: Get aggregated portfolio summary
 * - format_property_message: Format properties for C2S message
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";

export const propertyTools: Tool[] = [
  {
    name: "get_properties_by_cpf",
    description:
      "Find all properties owned by a CPF in the IBVI database. Returns detailed property information including type, address, market value, built area, rooms, and ownership percentage. Useful for understanding a lead's real estate portfolio.",
    inputSchema: {
      type: "object",
      properties: {
        cpf: {
          type: "string",
          description: "CPF number (11 digits, with or without formatting)",
        },
      },
      required: ["cpf"],
    },
  },
  {
    name: "get_property_summary",
    description:
      "Get an aggregated summary of a person's property portfolio. Returns total property count, total market value, and total built area. Quick overview without full property details.",
    inputSchema: {
      type: "object",
      properties: {
        cpf: {
          type: "string",
          description: "CPF number (11 digits, with or without formatting)",
        },
      },
      required: ["cpf"],
    },
  },
  {
    name: "format_property_message",
    description:
      "Format property data as a readable message for C2S CRM. Returns a formatted string suitable for adding to lead notes or messages.",
    inputSchema: {
      type: "object",
      properties: {
        cpf: {
          type: "string",
          description: "CPF number to look up and format properties for",
        },
      },
      required: ["cpf"],
    },
  },
];

export async function handlePropertyTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "get_properties_by_cpf": {
      const { cpf } = args as { cpf: string };

      // Normalize CPF
      const normalizedCpf = cpf.replace(/\D/g, "");

      if (normalizedCpf.length !== 11) {
        return {
          success: false,
          error: "CPF must have 11 digits",
          provided: cpf,
        };
      }

      const result = await container.ibviProperty.findPropertiesByCpf(normalizedCpf);

      if (!result) {
        return {
          success: false,
          message: "No properties found for this CPF in IBVI database",
          cpf: normalizedCpf,
        };
      }

      // Format CPF for display
      const cpfFormatted = normalizedCpf.replace(
        /(\d{3})(\d{3})(\d{3})(\d{2})/,
        "$1.$2.$3-$4",
      );

      return {
        success: true,
        cpf: cpfFormatted,
        summary: {
          totalProperties: result.totalProperties,
          totalCurrentProperties: result.totalCurrentProperties,
          totalMarketValue: result.totalMarketValue,
          totalMarketValueFormatted: formatCurrency(result.totalMarketValue),
          totalBuiltArea: result.totalBuiltArea,
          totalBuiltAreaFormatted: `${result.totalBuiltArea.toFixed(0)} m²`,
        },
        properties: result.properties.map((p) => ({
          propertyId: p.propertyId,
          ownershipPercentage: p.ownershipPercentage,
          ownershipType: p.ownershipType,
          isCurrent: p.isCurrent,
          type: p.property.propertyType,
          builtArea: p.property.builtAreaSqm,
          landArea: p.property.landAreaSqm,
          rooms: p.property.roomsCount,
          bathrooms: p.property.bathroomsCount,
          parking: p.property.parkingSpaces,
          marketValue: p.property.marketValueBrl,
          marketValueFormatted: p.property.marketValueBrl
            ? formatCurrency(p.property.marketValueBrl)
            : null,
          taxValue: p.property.taxValueBrl,
          monthlyTax: p.property.monthlyTaxBrl,
          address: {
            full: formatAddress(p.address),
            street: p.address.street,
            number: p.address.number,
            complement: p.address.complement,
            neighborhood: p.address.neighborhood,
            city: p.address.city,
            state: p.address.state,
            zipCode: p.address.zipCode,
          },
          codes: {
            propertyCode: p.property.propertyCode,
            iptuCode: p.property.iptuCode,
          },
        })),
      };
    }

    case "get_property_summary": {
      const { cpf } = args as { cpf: string };

      // Normalize CPF
      const normalizedCpf = cpf.replace(/\D/g, "");

      if (normalizedCpf.length !== 11) {
        return {
          success: false,
          error: "CPF must have 11 digits",
          provided: cpf,
        };
      }

      const result = await container.ibviProperty.findPropertiesByCpf(normalizedCpf);

      if (!result) {
        return {
          success: false,
          message: "No properties found for this CPF",
          cpf: normalizedCpf,
          hasProperties: false,
        };
      }

      // Format CPF for display
      const cpfFormatted = normalizedCpf.replace(
        /(\d{3})(\d{3})(\d{3})(\d{2})/,
        "$1.$2.$3-$4",
      );

      // Calculate average values
      const currentProperties = result.properties.filter((p) => p.isCurrent);
      const avgValue =
        currentProperties.length > 0
          ? result.totalMarketValue / currentProperties.length
          : 0;

      // Get neighborhoods
      const neighborhoods = [
        ...new Set(
          result.properties
            .map((p) => p.address.neighborhood)
            .filter(Boolean) as string[],
        ),
      ];

      // Get property types
      const propertyTypes = [
        ...new Set(
          result.properties
            .map((p) => p.property.propertyType)
            .filter(Boolean) as string[],
        ),
      ];

      return {
        success: true,
        cpf: cpfFormatted,
        hasProperties: true,
        summary: {
          totalProperties: result.totalProperties,
          currentProperties: result.totalCurrentProperties,
          totalMarketValue: result.totalMarketValue,
          totalMarketValueFormatted: formatCurrency(result.totalMarketValue),
          averagePropertyValue: avgValue,
          averagePropertyValueFormatted: formatCurrency(avgValue),
          totalBuiltArea: result.totalBuiltArea,
          totalBuiltAreaFormatted: `${result.totalBuiltArea.toFixed(0)} m²`,
          neighborhoods,
          propertyTypes,
        },
        insight:
          result.totalMarketValue > 1000000
            ? "High-value property owner"
            : result.totalProperties > 2
              ? "Multiple property owner"
              : "Property owner",
      };
    }

    case "format_property_message": {
      const { cpf } = args as { cpf: string };

      // Normalize CPF
      const normalizedCpf = cpf.replace(/\D/g, "");

      if (normalizedCpf.length !== 11) {
        return {
          success: false,
          error: "CPF must have 11 digits",
          provided: cpf,
        };
      }

      const result = await container.ibviProperty.findPropertiesByCpf(normalizedCpf);

      if (!result || result.totalProperties === 0) {
        return {
          success: true,
          cpf: normalizedCpf,
          hasProperties: false,
          message: "",
          note: "No properties found for this CPF",
        };
      }

      const formattedMessage = container.ibviProperty.formatForMessage(result);

      return {
        success: true,
        cpf: normalizedCpf,
        hasProperties: true,
        propertyCount: result.totalProperties,
        message: formattedMessage,
      };
    }

    default:
      throw new Error(`Unknown property tool: ${name}`);
  }
}

// Helper functions
function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatAddress(address: {
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}): string {
  const parts: string[] = [];

  if (address.street) {
    let streetPart = address.street;
    if (address.number) streetPart += `, ${address.number}`;
    if (address.complement) streetPart += ` - ${address.complement}`;
    parts.push(streetPart);
  }

  if (address.neighborhood) parts.push(address.neighborhood);

  const cityState = [address.city, address.state].filter(Boolean).join("/");
  if (cityState) parts.push(cityState);

  if (address.zipCode) parts.push(`CEP ${address.zipCode}`);

  return parts.join(" - ");
}
