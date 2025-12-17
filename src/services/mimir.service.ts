import { getConfig } from '../config'
import { mimirLogger } from '../utils/logger'
import { normalizePhone } from '../utils/phone'
import { AppError } from '../errors/app-error'

// Mimir can return two different response formats
export interface MimirResponseV1 {
  cpf?: string
  nome?: string
  error?: string
}

export interface MimirResponseV2 {
  data?: {
    cpf?: string
    nome?: string
  }
  success?: boolean
  error?: string
}

export type MimirResponse = MimirResponseV1 | MimirResponseV2

/**
 * Mimir API Service (Azure IBVI fallback)
 * Uses Bearer token authentication
 */
export class MimirService {
  private readonly token: string
  private readonly baseUrl: string

  constructor() {
    const config = getConfig()
    this.token = config.MIMIR_TOKEN
    this.baseUrl = config.MIMIR_URL
  }

  async findCpfByPhone(phone: string): Promise<string | null> {
    const normalizedPhone = normalizePhone(phone)
    mimirLogger.info({ phone: normalizedPhone }, 'Looking up CPF by phone in Mimir')

    try {
      const response = await fetch(`${this.baseUrl}/api/telefone/${normalizedPhone}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          mimirLogger.debug({ phone: normalizedPhone }, 'Phone not found in Mimir')
          return null
        }
        throw new Error(`Mimir returned ${response.status}`)
      }

      const data = (await response.json()) as MimirResponse

      // Handle both response formats
      let cpf: string | undefined

      if ('data' in data && data.data?.cpf) {
        // V2 format: { data: { cpf, nome }, success: true }
        cpf = data.data.cpf
      } else if ('cpf' in data && data.cpf) {
        // V1 format: { cpf, nome }
        cpf = data.cpf
      }

      if (!cpf) {
        mimirLogger.debug({ phone: normalizedPhone }, 'No CPF found in Mimir response')
        return null
      }

      mimirLogger.info({ phone: normalizedPhone, cpf }, 'Found CPF by phone in Mimir')
      return cpf
    } catch (error) {
      mimirLogger.error({ phone: normalizedPhone, error }, 'Failed to lookup phone in Mimir')
      throw AppError.serviceUnavailable('Mimir')
    }
  }
}
