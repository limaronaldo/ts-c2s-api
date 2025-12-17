import { getConfig } from '../config'
import { workApiLogger } from '../utils/logger'
import { workApiCache } from '../utils/cache'
import { AppError } from '../errors/app-error'

export interface WorkApiPerson {
  cpf: string
  nome: string
  dataNascimento?: string
  sexo?: string
  nomeMae?: string
  renda?: number
  rendaPresumida?: number
  patrimonio?: number
  escolaridade?: string
  estadoCivil?: string
  profissao?: string
  telefones?: Array<{
    numero: string
    tipo?: string
  }>
  emails?: Array<{
    email: string
  }>
  enderecos?: Array<{
    logradouro?: string
    numero?: string
    complemento?: string
    bairro?: string
    cidade?: string
    uf?: string
    cep?: string
  }>
}

export interface WorkApiResponse {
  success: boolean
  data?: WorkApiPerson
  error?: string
}

export class WorkApiService {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor() {
    const config = getConfig()
    this.apiKey = config.WORK_API
    this.baseUrl = config.WORK_API_URL
  }

  async fetchByCpf(cpf: string): Promise<WorkApiPerson | null> {
    const cacheKey = `cpf:${cpf}`
    const cached = workApiCache.get(cacheKey) as WorkApiPerson | undefined
    if (cached) {
      workApiLogger.debug({ cpf }, 'Cache hit for Work API')
      return cached
    }

    workApiLogger.info({ cpf }, 'Fetching from Work API')

    try {
      const response = await fetch(`${this.baseUrl}/v1/pessoa/${cpf}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          workApiLogger.debug({ cpf }, 'Person not found in Work API')
          return null
        }
        throw new Error(`Work API returned ${response.status}`)
      }

      const data = (await response.json()) as WorkApiResponse

      if (!data.success || !data.data) {
        workApiLogger.debug({ cpf }, 'Work API returned no data')
        return null
      }

      workApiCache.set(cacheKey, data.data)
      workApiLogger.info({ cpf, name: data.data.nome }, 'Successfully fetched from Work API')

      return data.data
    } catch (error) {
      workApiLogger.error({ cpf, error }, 'Failed to fetch from Work API')
      throw AppError.serviceUnavailable('Work API')
    }
  }
}
