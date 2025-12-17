import { getConfig } from '../config'
import { dbaseLogger } from '../utils/logger'
import { normalizePhone } from '../utils/phone'
import { AppError } from '../errors/app-error'

export interface DBaseResponse {
  cpf?: string
  nome?: string
  status?: string
  message?: string
}

/**
 * DBase API Service (fallback for phone to CPF lookup)
 * Uses multipart form-data with token in body (not header)
 */
export class DBaseService {
  private readonly token: string
  private readonly baseUrl: string

  constructor() {
    const config = getConfig()
    this.token = config.DBASE_TOKEN
    this.baseUrl = config.DBASE_URL
  }

  async findCpfByPhone(phone: string): Promise<string | null> {
    const normalizedPhone = normalizePhone(phone)
    dbaseLogger.info({ phone: normalizedPhone }, 'Looking up CPF by phone in DBase')

    try {
      // DBase uses multipart form-data with token in body
      const formData = new FormData()
      formData.append('token', this.token)
      formData.append('telefone', normalizedPhone)

      const response = await fetch(`${this.baseUrl}/api/telefone`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        if (response.status === 404) {
          dbaseLogger.debug({ phone: normalizedPhone }, 'Phone not found in DBase')
          return null
        }
        throw new Error(`DBase returned ${response.status}`)
      }

      const data = (await response.json()) as DBaseResponse

      if (!data.cpf || data.status === 'error') {
        dbaseLogger.debug({ phone: normalizedPhone, message: data.message }, 'No CPF found in DBase')
        return null
      }

      dbaseLogger.info({ phone: normalizedPhone, cpf: data.cpf }, 'Found CPF by phone in DBase')
      return data.cpf
    } catch (error) {
      dbaseLogger.error({ phone: normalizedPhone, error }, 'Failed to lookup phone in DBase')
      throw AppError.serviceUnavailable('DBase')
    }
  }
}
