import { Elysia, t } from 'elysia'
import { container } from '../container'
import { apiLogger } from '../utils/logger'
import { normalizeCpf, isValidCpf } from '../utils/normalize'
import { AppError } from '../errors/app-error'

export const workApiRoute = new Elysia({ prefix: '/work-api' }).get(
  '/pessoa/:cpf',
  async ({ params }) => {
    const cpf = normalizeCpf(params.cpf)

    if (!isValidCpf(cpf)) {
      throw AppError.badRequest('Invalid CPF format')
    }

    apiLogger.info({ cpf }, 'Fetching person data from Work API')

    const person = await container.workApi.fetchByCpf(cpf)

    if (!person) {
      return {
        error: { code: 'NOT_FOUND', message: 'Person not found' },
      }
    }

    return { data: person }
  },
  {
    params: t.Object({
      cpf: t.String(),
    }),
  }
)
