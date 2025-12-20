/**
 * IBVI Property Service
 * RML-596: Query property ownership data from IBVI database
 *
 * Uses core schema tables:
 * - core.parties (CPF/CNPJ lookup)
 * - core.property_ownerships (ownership records)
 * - core.real_estate_properties (property details)
 * - core.addresses (property addresses)
 */

import { getDb } from "../db/client";
import { sql } from "drizzle-orm";
import { enrichmentLogger } from "../utils/logger";

export interface PropertyOwnership {
  propertyId: string;
  ownershipPercentage: number;
  ownershipType: string;
  isCurrent: boolean;
  property: {
    propertyCode: string | null;
    iptuCode: string | null;
    propertyType: string | null;
    landAreaSqm: number | null;
    builtAreaSqm: number | null;
    roomsCount: number | null;
    bathroomsCount: number | null;
    parkingSpaces: number | null;
    marketValueBrl: number | null;
    taxValueBrl: number | null;
    monthlyTaxBrl: number | null;
  };
  address: {
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  };
}

export interface PropertySummary {
  totalProperties: number;
  totalCurrentProperties: number;
  totalMarketValue: number;
  totalBuiltArea: number;
  properties: PropertyOwnership[];
}

export class IbviPropertyService {
  /**
   * Find properties owned by a CPF
   */
  async findPropertiesByCpf(cpf: string): Promise<PropertySummary | null> {
    const db = getDb();

    // Normalize CPF (remove formatting)
    const normalizedCpf = cpf.replace(/\D/g, "");

    enrichmentLogger.info(
      { cpf: normalizedCpf },
      "Looking up properties in IBVI database",
    );

    try {
      // Query to find party by CPF and their property ownerships
      const result = await db.execute(sql`
        SELECT
          po.property_id,
          po.ownership_percentage,
          po.ownership_type,
          po.is_current,
          p.property_code,
          p.iptu_code,
          p.property_type,
          p.land_area_sqm,
          p.built_area_sqm,
          p.rooms_count,
          p.bathrooms_count,
          p.parking_spaces,
          p.market_value_brl,
          p.tax_value_brl,
          p.monthly_tax_brl,
          a.street,
          a.number,
          a.complement,
          a.neighborhood,
          a.city,
          a.state,
          a.zip_code
        FROM core.parties pa
        JOIN core.property_ownerships po ON pa.id = po.party_id
        JOIN core.real_estate_properties p ON po.property_id = p.property_id
        LEFT JOIN core.addresses a ON p.address_id = a.id
        WHERE pa.cpf_cnpj = ${normalizedCpf}
        ORDER BY po.is_current DESC, p.market_value_brl DESC NULLS LAST
        LIMIT 10
      `);

      // drizzle execute returns an array directly
      const rows = result as unknown as any[];

      if (!rows || rows.length === 0) {
        enrichmentLogger.debug(
          { cpf: normalizedCpf },
          "No properties found for CPF",
        );
        return null;
      }

      const properties: PropertyOwnership[] = rows.map((row: any) => ({
        propertyId: row.property_id,
        ownershipPercentage: parseFloat(row.ownership_percentage) || 0,
        ownershipType: row.ownership_type || "unknown",
        isCurrent: row.is_current ?? true,
        property: {
          propertyCode: row.property_code,
          iptuCode: row.iptu_code,
          propertyType: row.property_type,
          landAreaSqm: row.land_area_sqm ? parseFloat(row.land_area_sqm) : null,
          builtAreaSqm: row.built_area_sqm
            ? parseFloat(row.built_area_sqm)
            : null,
          roomsCount: row.rooms_count,
          bathroomsCount: row.bathrooms_count,
          parkingSpaces: row.parking_spaces,
          marketValueBrl: row.market_value_brl
            ? parseFloat(row.market_value_brl)
            : null,
          taxValueBrl: row.tax_value_brl ? parseFloat(row.tax_value_brl) : null,
          monthlyTaxBrl: row.monthly_tax_brl
            ? parseFloat(row.monthly_tax_brl)
            : null,
        },
        address: {
          street: row.street,
          number: row.number,
          complement: row.complement,
          neighborhood: row.neighborhood,
          city: row.city,
          state: row.state,
          zipCode: row.zip_code,
        },
      }));

      // Calculate summary
      const currentProperties = properties.filter((p) => p.isCurrent);
      const totalMarketValue = currentProperties.reduce(
        (sum, p) => sum + (p.property.marketValueBrl || 0),
        0,
      );
      const totalBuiltArea = currentProperties.reduce(
        (sum, p) => sum + (p.property.builtAreaSqm || 0),
        0,
      );

      const summary: PropertySummary = {
        totalProperties: properties.length,
        totalCurrentProperties: currentProperties.length,
        totalMarketValue,
        totalBuiltArea,
        properties,
      };

      enrichmentLogger.info(
        {
          cpf: normalizedCpf,
          totalProperties: summary.totalProperties,
          currentProperties: summary.totalCurrentProperties,
          totalValue: totalMarketValue,
        },
        "Found properties for CPF",
      );

      return summary;
    } catch (error) {
      enrichmentLogger.error(
        { cpf: normalizedCpf, error },
        "Failed to query IBVI properties",
      );
      return null;
    }
  }

  /**
   * Format property data for C2S message
   */
  formatForMessage(summary: PropertySummary): string {
    if (!summary || summary.totalProperties === 0) {
      return "";
    }

    const lines: string[] = [];
    lines.push(`🏠 IMÓVEIS (${summary.totalCurrentProperties} atual)`);

    // Show total value if available
    if (summary.totalMarketValue > 0) {
      lines.push(
        `   Valor total: R$ ${this.formatCurrency(summary.totalMarketValue)}`,
      );
    }

    if (summary.totalBuiltArea > 0) {
      lines.push(`   Área total: ${summary.totalBuiltArea.toFixed(0)} m²`);
    }

    // List properties (max 3 for brevity)
    const propertiesToShow = summary.properties.slice(0, 3);
    for (const prop of propertiesToShow) {
      const addr = prop.address;
      const location = [addr.neighborhood, addr.city, addr.state]
        .filter(Boolean)
        .join(", ");

      let propLine = `   • ${prop.property.propertyType || "Imóvel"}`;
      if (location) propLine += ` em ${location}`;
      if (prop.property.builtAreaSqm) {
        propLine += ` (${prop.property.builtAreaSqm.toFixed(0)} m²)`;
      }
      if (prop.property.marketValueBrl) {
        propLine += ` - R$ ${this.formatCurrency(prop.property.marketValueBrl)}`;
      }
      lines.push(propLine);
    }

    if (summary.properties.length > 3) {
      lines.push(`   ... e mais ${summary.properties.length - 3} imóvel(is)`);
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
