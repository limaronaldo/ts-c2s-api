import { Elysia, t } from 'elysia'
import { container } from '../container'
import { apiLogger } from '../utils/logger'

export const leadsRoute = new Elysia({ prefix: '/leads' })
  .get(
    '/:leadId',
    async ({ params }) => {
      const lead = await container.dbStorage.findLeadByLeadId(params.leadId)

      if (!lead) {
        return {
          error: { code: 'NOT_FOUND', message: 'Lead not found' },
        }
      }

      return { data: lead }
    },
    {
      params: t.Object({
        leadId: t.String(),
      }),
    }
  )
  .post(
    '/',
    async ({ body }) => {
      apiLogger.info({ leadId: body.leadId, name: body.name }, 'Creating new lead')

      const lead = await container.dbStorage.upsertGoogleAdsLead({
        leadId: body.leadId,
        name: body.name,
        phone: body.phone,
        email: body.email,
        campaignId: body.campaignId,
        campaignName: body.campaignName,
        rawData: body.rawData,
        enrichmentStatus: 'pending',
      })

      return { data: lead }
    },
    {
      body: t.Object({
        leadId: t.String(),
        name: t.String(),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
        campaignId: t.Optional(t.String()),
        campaignName: t.Optional(t.String()),
        rawData: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
    }
  )
