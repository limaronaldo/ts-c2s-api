import { Elysia, t } from 'elysia'
import { container } from '../container'
import { apiLogger } from '../utils/logger'

export const activitiesRoute = new Elysia({ prefix: '/leads/:leadId' })
  .post(
    '/interact',
    async ({ params }) => {
      apiLogger.info({ leadId: params.leadId }, 'Marking lead as interacted')

      const result = await container.c2s.markLeadAsInteracted(params.leadId)

      return result
    },
    {
      params: t.Object({
        leadId: t.String(),
      }),
    }
  )
  .post(
    '/message',
    async ({ params, body }) => {
      apiLogger.info({ leadId: params.leadId }, 'Creating message for lead')

      const result = await container.c2s.createMessage(
        params.leadId,
        body.message,
        body.type,
      )

      return result
    },
    {
      params: t.Object({
        leadId: t.String(),
      }),
      body: t.Object({
        message: t.String(),
        type: t.Optional(t.String()),
      }),
    }
  )
  .post(
    '/done-deal',
    async ({ params, body }) => {
      apiLogger.info({ leadId: params.leadId, value: body.value }, 'Marking lead as done deal')

      const result = await container.c2s.markDoneDeal(
        params.leadId,
        body.value,
        body.description,
      )

      return result
    },
    {
      params: t.Object({
        leadId: t.String(),
      }),
      body: t.Object({
        value: t.Number(),
        description: t.Optional(t.String()),
      }),
    }
  )
  .post(
    '/visit',
    async ({ params, body }) => {
      apiLogger.info({ leadId: params.leadId, visitDate: body.visitDate }, 'Creating visit for lead')

      const result = await container.c2s.createVisit(
        params.leadId,
        body.visitDate,
        body.description,
      )

      return result
    },
    {
      params: t.Object({
        leadId: t.String(),
      }),
      body: t.Object({
        visitDate: t.String(),
        description: t.Optional(t.String()),
      }),
    }
  )
  .post(
    '/activity',
    async ({ params, body }) => {
      apiLogger.info({ leadId: params.leadId, type: body.type }, 'Creating activity for lead')

      const result = await container.c2s.createActivity(
        params.leadId,
        body.type,
        body.description,
        body.date,
      )

      return result
    },
    {
      params: t.Object({
        leadId: t.String(),
      }),
      body: t.Object({
        type: t.String(),
        description: t.String(),
        date: t.Optional(t.String()),
      }),
    }
  )
