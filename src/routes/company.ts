import { Elysia, t } from 'elysia'
import { container } from '../container'
import { apiLogger } from '../utils/logger'

export const companyRoute = new Elysia()
  // Company info
  .get(
    '/company',
    async () => {
      apiLogger.info('Fetching company info')

      const info = await container.c2s.getCompanyInfo()

      return info
    }
  )
  // C2S Webhook management
  .post(
    '/c2s-webhooks/subscribe',
    async ({ body }) => {
      apiLogger.info({ url: body.url, events: body.events }, 'Subscribing to C2S webhook')

      const result = await container.c2s.subscribeWebhook(body.url, body.events)

      return result
    },
    {
      body: t.Object({
        url: t.String(),
        events: t.Array(t.String()),
      }),
    }
  )
  .post(
    '/c2s-webhooks/unsubscribe',
    async ({ body }) => {
      apiLogger.info({ url: body.url }, 'Unsubscribing from C2S webhook')

      const result = await container.c2s.unsubscribeWebhook(body.url)

      return result
    },
    {
      body: t.Object({
        url: t.String(),
      }),
    }
  )
