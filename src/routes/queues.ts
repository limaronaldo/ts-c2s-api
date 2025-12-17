import { Elysia, t } from 'elysia'
import { container } from '../container'
import { apiLogger } from '../utils/logger'

export const queuesRoute = new Elysia({ prefix: '/queues' })
  .get(
    '/',
    async () => {
      apiLogger.info('Fetching distribution queues')

      const queues = await container.c2s.getDistributionQueues()

      return queues
    }
  )
  .get(
    '/:queueId/sellers',
    async ({ params }) => {
      apiLogger.info({ queueId: params.queueId }, 'Fetching queue sellers')

      const sellers = await container.c2s.getQueueSellers(params.queueId)

      return sellers
    },
    {
      params: t.Object({
        queueId: t.String(),
      }),
    }
  )
  .post(
    '/:queueId/redistribute',
    async ({ params, body }) => {
      apiLogger.info({ queueId: params.queueId, leadId: body.leadId, sellerId: body.sellerId }, 'Redistributing lead')

      const result = await container.c2s.redistributeLead(
        params.queueId,
        body.leadId,
        body.sellerId,
      )

      return result
    },
    {
      params: t.Object({
        queueId: t.String(),
      }),
      body: t.Object({
        leadId: t.String(),
        sellerId: t.String(),
      }),
    }
  )
  .post(
    '/:queueId/priority',
    async ({ params, body }) => {
      apiLogger.info({ queueId: params.queueId, sellerId: body.sellerId, priority: body.priority }, 'Updating seller priority')

      const result = await container.c2s.updateSellerPriority(
        params.queueId,
        body.sellerId,
        body.priority,
      )

      return result
    },
    {
      params: t.Object({
        queueId: t.String(),
      }),
      body: t.Object({
        sellerId: t.String(),
        priority: t.Number(),
      }),
    }
  )
  .post(
    '/:queueId/next-seller',
    async ({ params, body }) => {
      apiLogger.info({ queueId: params.queueId, sellerId: body.sellerId }, 'Setting next seller')

      const result = await container.c2s.setNextSeller(params.queueId, body.sellerId)

      return result
    },
    {
      params: t.Object({
        queueId: t.String(),
      }),
      body: t.Object({
        sellerId: t.String(),
      }),
    }
  )
  .post(
    '/rules',
    async ({ body }) => {
      apiLogger.info({ rule: body }, 'Creating distribution rule')

      const result = await container.c2s.createDistributionRule(body)

      return result
    },
    {
      body: t.Record(t.String(), t.Unknown()),
    }
  )
