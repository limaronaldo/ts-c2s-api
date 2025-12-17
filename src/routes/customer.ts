import { Elysia, t } from 'elysia'
import { container } from '../container'
import { apiLogger } from '../utils/logger'
import { normalizeCpf } from '../utils/normalize'
import { normalizePhone } from '../utils/phone'

export const customerRoute = new Elysia({ prefix: '/customer' })
  .get(
    '/cpf/:cpf',
    async ({ params }) => {
      const cpf = normalizeCpf(params.cpf)
      apiLogger.info({ cpf }, 'Looking up customer by CPF')

      // Check local database first
      const party = await container.dbStorage.findPartyByCpf(cpf)

      if (party) {
        const contacts = await container.dbStorage.findContactsByPartyId(party.id)
        return {
          data: {
            ...party,
            contacts,
            source: 'local',
          },
        }
      }

      // Check C2S
      const c2sCustomer = await container.c2s.findCustomerByCpf(cpf)

      if (c2sCustomer) {
        return {
          data: {
            ...c2sCustomer.attributes,
            id: c2sCustomer.id,
            source: 'c2s',
          },
        }
      }

      return {
        error: { code: 'NOT_FOUND', message: 'Customer not found' },
      }
    },
    {
      params: t.Object({
        cpf: t.String(),
      }),
    }
  )
  .get(
    '/phone/:phone',
    async ({ params }) => {
      const phone = normalizePhone(params.phone)
      apiLogger.info({ phone }, 'Looking up customer by phone')

      // Check C2S
      const c2sCustomer = await container.c2s.findCustomerByPhone(phone)

      if (c2sCustomer) {
        return {
          data: {
            ...c2sCustomer.attributes,
            id: c2sCustomer.id,
            source: 'c2s',
          },
        }
      }

      return {
        error: { code: 'NOT_FOUND', message: 'Customer not found' },
      }
    },
    {
      params: t.Object({
        phone: t.String(),
      }),
    }
  )
  .get(
    '/email/:email',
    async ({ params }) => {
      const email = params.email.toLowerCase()
      apiLogger.info({ email }, 'Looking up customer by email')

      // Check C2S
      const c2sCustomer = await container.c2s.findCustomerByEmail(email)

      if (c2sCustomer) {
        return {
          data: {
            ...c2sCustomer.attributes,
            id: c2sCustomer.id,
            source: 'c2s',
          },
        }
      }

      return {
        error: { code: 'NOT_FOUND', message: 'Customer not found' },
      }
    },
    {
      params: t.Object({
        email: t.String(),
      }),
    }
  )
