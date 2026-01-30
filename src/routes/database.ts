/**
 * Database Routes - Retrieve saved enrichment data
 *
 * Provides endpoints for:
 * - Get saved person by CPF
 * - Get saved person by phone
 * - List recent enriched leads
 * - Search saved leads
 */

import { Elysia, t } from "elysia";
import { container } from "../container";
import { apiLogger } from "../utils/logger";
import { eq, or, sql } from "drizzle-orm";
import { schema } from "../db/client";
import { formatPhoneWithCountryCode, normalizePhone } from "../utils/phone";

export const databaseRoute = new Elysia({ prefix: "/db" })
  /**
   * GET /db/person/:cpf
   * Get saved person data by CPF
   */
  .get(
    "/person/:cpf",
    async ({ params }) => {
      const cpf = params.cpf.replace(/\D/g, "");

      apiLogger.info({ cpf: cpf.substring(0, 3) + "***" }, "DB lookup by CPF");

      const party = await container.dbStorage.findPartyByCpf(cpf);

      if (!party) {
        return {
          success: false,
          error: "Person not found in database",
          cpf,
        };
      }

      // Get contacts
      const contacts = await container.dbStorage.findContactsByPartyId(
        party.id,
      );
      const phones = contacts
        .filter((c) => c.type === "phone")
        .map((c) => c.value);
      const emails = contacts
        .filter((c) => c.type === "email")
        .map((c) => c.value);

      // Get addresses
      const db = container.dbStorage.getDb();
      const addresses = await db
        .select()
        .from(schema.addresses)
        .where(eq(schema.addresses.partyId, party.id));

      return {
        success: true,
        data: {
          id: party.id,
          cpf: party.cpfCnpj,
          name: party.name,
          birthDate: party.birthDate,
          gender: party.gender,
          motherName: party.motherName,
          income: party.income ? parseFloat(party.income) : null,
          phones,
          emails,
          addresses: addresses.map((a) => ({
            street: a.street,
            number: a.number,
            complement: a.complement,
            neighborhood: a.neighborhood,
            city: a.city,
            state: a.state,
            zipCode: a.zipCode,
          })),
          createdAt: party.createdAt,
          updatedAt: party.updatedAt,
        },
      };
    },
    {
      params: t.Object({
        cpf: t.String({ minLength: 11, maxLength: 14 }),
      }),
    },
  )

  /**
   * GET /db/person/phone/:phone
   * Get saved person data by phone number
   */
  .get(
    "/person/phone/:phone",
    async ({ params }) => {
      const normalizedPhone = normalizePhone(params.phone);
      const phoneWithCountry = formatPhoneWithCountryCode(normalizedPhone);

      apiLogger.info({ phone: phoneWithCountry }, "DB lookup by phone");

      const db = container.dbStorage.getDb();

      // Find contact by phone
      const contacts = await db
        .select()
        .from(schema.partyContacts)
        .where(
          phoneWithCountry === normalizedPhone
            ? eq(schema.partyContacts.value, phoneWithCountry)
            : or(
                eq(schema.partyContacts.value, phoneWithCountry),
                eq(schema.partyContacts.value, normalizedPhone),
              ),
        )
        .limit(1);

      if (!contacts.length) {
        return {
          success: false,
          error: "Phone not found in database",
          phone: normalizedPhone,
        };
      }

      const partyId = contacts[0].partyId;
      const party = await container.dbStorage.findPartyById(partyId);

      if (!party) {
        return {
          success: false,
          error: "Party not found",
          phone: normalizedPhone,
        };
      }

      // Get all contacts
      const allContacts = await container.dbStorage.findContactsByPartyId(
        party.id,
      );
      const phones = allContacts
        .filter((c) => c.type === "phone")
        .map((c) => c.value);
      const emails = allContacts
        .filter((c) => c.type === "email")
        .map((c) => c.value);

      // Get addresses
      const addresses = await db
        .select()
        .from(schema.addresses)
        .where(eq(schema.addresses.partyId, party.id));

      return {
        success: true,
        data: {
          id: party.id,
          cpf: party.cpfCnpj,
          name: party.name,
          birthDate: party.birthDate,
          gender: party.gender,
          motherName: party.motherName,
          income: party.income ? parseFloat(party.income) : null,
          phones,
          emails,
          addresses: addresses.map((a) => ({
            street: a.street,
            number: a.number,
            complement: a.complement,
            neighborhood: a.neighborhood,
            city: a.city,
            state: a.state,
            zipCode: a.zipCode,
          })),
          createdAt: party.createdAt,
          updatedAt: party.updatedAt,
        },
        phone: normalizedPhone,
      };
    },
    {
      params: t.Object({
        phone: t.String({ minLength: 8, maxLength: 15 }),
      }),
    },
  )

  /**
   * GET /db/persons/recent
   * Get recently saved persons (uses raw SQL for performance)
   */
  .get(
    "/persons/recent",
    async ({ query }) => {
      const limit = parseLimit(query.limit, 50);
      const offset = parseOffset(query.offset);

      apiLogger.info({ limit, offset }, "DB list recent persons");

      const db = container.dbStorage.getDb();

      // Use raw SQL for better performance (avoid slow ORDER BY without index)
      const result = await db.execute(sql`
        SELECT id, cpf_cnpj as cpf, name, income, gender, created_at
        FROM analytics.parties
        WHERE type = 'person'
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

      // Drizzle execute returns array directly
      const parties = Array.isArray(result)
        ? result
        : (result as any).rows || [];

      return {
        success: true,
        data: {
          count: parties.length,
          offset,
          persons: parties.map((p: any) => ({
            id: p.id,
            cpf: p.cpf,
            name: p.name,
            income: p.income ? parseFloat(p.income) : null,
            gender: p.gender,
            createdAt: p.created_at,
          })),
        },
      };
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  )

  /**
   * GET /db/persons/search
   * Search saved persons by name
   */
  .get(
    "/persons/search",
    async ({ query }) => {
      const q = query.q;
      const limit = parseLimit(query.limit, 20);

      if (!q || q.length < 3) {
        return {
          success: false,
          error: "Search query must be at least 3 characters",
        };
      }

      apiLogger.info({ query: q, limit }, "DB search persons");

      const db = container.dbStorage.getDb();
      const searchPattern = `%${q.toUpperCase()}%`;

      const result = await db.execute(sql`
        SELECT id, cpf_cnpj as cpf, name, income, gender, created_at
        FROM analytics.parties
        WHERE type = 'person' AND UPPER(name) LIKE ${searchPattern}
        LIMIT ${limit}
      `);

      const parties = Array.isArray(result)
        ? result
        : (result as any).rows || [];

      return {
        success: true,
        data: {
          query: q,
          count: parties.length,
          persons: parties.map((p: any) => ({
            id: p.id,
            cpf: p.cpf,
            name: p.name,
            income: p.income ? parseFloat(p.income) : null,
            gender: p.gender,
            createdAt: p.created_at,
          })),
        },
      };
    },
    {
      query: t.Object({
        q: t.String(),
        limit: t.Optional(t.String()),
      }),
    },
  )

  /**
   * GET /db/stats
   * Get database statistics
   */
  .get("/stats", async () => {
    const db = container.dbStorage.getDb();

    const [totalPersons] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.parties)
      .where(eq(schema.parties.type, "person"));

    const [withIncome] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.parties)
      .where(
        sql`${schema.parties.type} = 'person' AND ${schema.parties.income} IS NOT NULL`,
      );

    const [totalContacts] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.partyContacts);

    const [totalAddresses] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.addresses);

    const totalPersonsCount = Number(totalPersons.count);
    const withIncomeCount = Number(withIncome.count);
    const incomeRate =
      totalPersonsCount > 0
        ? `${((withIncomeCount / totalPersonsCount) * 100).toFixed(1)}%`
        : "0.0%";

    return {
      success: true,
      data: {
        totalPersons: totalPersonsCount,
        withIncome: withIncomeCount,
        incomeRate,
        totalContacts: Number(totalContacts.count),
        totalAddresses: Number(totalAddresses.count),
      },
    };
  });

function parseLimit(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 100);
}

function parseOffset(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}
