import { Elysia, t } from "elysia";
import { container } from "../container";
import { apiLogger } from "../utils/logger";
import { normalizeCpf } from "../utils/normalize";
import { normalizePhone } from "../utils/phone";

export const customerRoute = new Elysia({ prefix: "/customer" })
  .get(
    "/cpf/:cpf",
    async ({ params }) => {
      const cpf = normalizeCpf(params.cpf);
      apiLogger.info({ cpf }, "Looking up customer by CPF");

      // Check local database first
      const party = await container.dbStorage.findPartyByCpf(cpf);

      if (party) {
        const contacts = await container.dbStorage.findContactsByPartyId(
          party.id,
        );
        return {
          data: {
            ...party,
            contacts,
            source: "local",
          },
        };
      }

      return {
        error: { code: "NOT_FOUND", message: "Customer not found" },
      };
    },
    {
      params: t.Object({
        cpf: t.String(),
      }),
    },
  )
  .get(
    "/phone/:phone",
    async ({ params }) => {
      const phone = normalizePhone(params.phone);
      apiLogger.info({ phone }, "Looking up customer by phone");

      // Check C2S leads by phone
      const c2sLead = await container.c2s.findLeadByPhone(phone);

      if (c2sLead) {
        return {
          data: {
            id: c2sLead.id,
            customer: c2sLead.customer,
            phone: c2sLead.phone,
            email: c2sLead.email,
            status: c2sLead.status,
            source: "c2s",
          },
        };
      }

      return {
        error: { code: "NOT_FOUND", message: "Customer not found" },
      };
    },
    {
      params: t.Object({
        phone: t.String(),
      }),
    },
  )
  .get(
    "/email/:email",
    async ({ params }) => {
      const email = params.email.toLowerCase();
      apiLogger.info({ email }, "Looking up customer by email");

      // Check C2S leads by email
      const c2sLead = await container.c2s.findLeadByEmail(email);

      if (c2sLead) {
        return {
          data: {
            id: c2sLead.id,
            customer: c2sLead.customer,
            phone: c2sLead.phone,
            email: c2sLead.email,
            status: c2sLead.status,
            source: "c2s",
          },
        };
      }

      return {
        error: { code: "NOT_FOUND", message: "Customer not found" },
      };
    },
    {
      params: t.Object({
        email: t.String(),
      }),
    },
  );
