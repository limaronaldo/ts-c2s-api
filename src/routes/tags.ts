import { Elysia, t } from 'elysia'
import { container } from '../container'
import { apiLogger } from '../utils/logger'

export const tagsRoute = new Elysia({ prefix: '/tags' })
  .get(
    '/',
    async ({ query }) => {
      apiLogger.info({ query }, 'Fetching tags list')

      const tags = await container.c2s.getTags(
        query.name,
        query.autofill === 'true',
      )

      return tags
    },
    {
      query: t.Object({
        name: t.Optional(t.String()),
        autofill: t.Optional(t.String()),
      }),
    }
  )
  .post(
    '/',
    async ({ body }) => {
      apiLogger.info({ name: body.name }, 'Creating new tag')

      const tag = await container.c2s.createTag({
        name: body.name,
        color: body.color,
      })

      return tag
    },
    {
      body: t.Object({
        name: t.String(),
        color: t.Optional(t.String()),
      }),
    }
  )
  // Lead-specific tag operations
  .get(
    '/lead/:leadId',
    async ({ params }) => {
      apiLogger.info({ leadId: params.leadId }, 'Fetching lead tags')

      const tags = await container.c2s.getLeadTags(params.leadId)

      return tags
    },
    {
      params: t.Object({
        leadId: t.String(),
      }),
    }
  )
  .post(
    '/lead/:leadId',
    async ({ params, body }) => {
      apiLogger.info({ leadId: params.leadId, tagId: body.tagId }, 'Adding tag to lead')

      const result = await container.c2s.addLeadTag(params.leadId, body.tagId)

      return result
    },
    {
      params: t.Object({
        leadId: t.String(),
      }),
      body: t.Object({
        tagId: t.String(),
      }),
    }
  )
