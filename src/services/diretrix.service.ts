import { getConfig } from '../config'
import { diretrixLogger } from '../utils/logger'
import { normalizePhone } from '../utils/phone'
import { AppError } from '../errors/app-error'

export interface DiretrixResponse {
  cpf?: string
  nome?: string
  erro?: string
}

export class DiretrixService {
  private readonly user: string
  private readonly pass: string
  private readonly baseUrl: string

  constructor() {
    const config = getConfig()
    this.user = config.DIRETRIX_USER
    this.pass = config.DIRETRIX_PASS
    this.baseUrl = config.DIRETRIX_URL
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.user}:${this.pass}`).toString('base64')
    return `Basic ${credentials}`
  }

  async findCpfByPhone(phone: string): Promise<string | null> {
    const normalizedPhone = normalizePhone(phone)
    diretrixLogger.info({ phone: normalizedPhone }, 'Looking up CPF by phone in Diretrix')

    try {
      const response = await fetch(`${this.baseUrl}/v1/telefone/${normalizedPhone}`, {
        method: 'GET',
        headers: {
          Authorization: this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          diretrixLogger.debug({ phone: normalizedPhone }, 'Phone not found in Diretrix')
          return null
        }
        throw new Error(`Diretrix returned ${response.status}`)
      }

      const data = (await response.json()) as DiretrixResponse

      if (data.erro || !data.cpf) {
        diretrixLogger.debug({ phone: normalizedPhone, error: data.erro }, 'No CPF found for phone')
        return null
      }

      diretrixLogger.info({ phone: normalizedPhone, cpf: data.cpf }, 'Found CPF by phone in Diretrix')
      return data.cpf
    } catch (error) {
      diretrixLogger.error({ phone: normalizedPhone, error }, 'Failed to lookup phone in Diretrix')
      throw AppError.serviceUnavailable('Diretrix')
    }
  }

  async findCpfByEmail(email: string): Promise<string | null> {
    diretrixLogger.info({ email }, 'Looking up CPF by email in Diretrix')

    try {
      const response = await fetch(`${this.baseUrl}/v1/email/${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: {
          Authorization: this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          diretrixLogger.debug({ email }, 'Email not found in Diretrix')
          return null
        }
        throw new Error(`Diretrix returned ${response.status}`)
      }

      const data = (await response.json()) as DiretrixResponse

      if (data.erro || !data.cpf) {
        diretrixLogger.debug({ email, error: data.erro }, 'No CPF found for email')
        return null
      }

      diretrixLogger.info({ email, cpf: data.cpf }, 'Found CPF by email in Diretrix')
      return data.cpf
    } catch (error) {
      diretrixLogger.error({ email, error }, 'Failed to lookup email in Diretrix')
      throw AppError.serviceUnavailable('Diretrix')
    }
  }
}
