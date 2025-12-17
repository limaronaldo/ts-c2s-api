import { getConfig } from '../config'
import { c2sLogger } from '../utils/logger'
import { AppError } from '../errors/app-error'

// JSON:API format for C2S
export interface C2SCustomerAttributes {
  name: string
  email?: string
  phone?: string
  cpf?: string
  description?: string
  source?: string
  campaign?: string
  custom_fields?: Record<string, unknown>
}

export interface C2SCustomerRequest {
  data: {
    type: 'customers'
    attributes: C2SCustomerAttributes
  }
}

export interface C2SCustomerResponse {
  data: {
    id: string
    type: 'customers'
    attributes: C2SCustomerAttributes & {
      created_at: string
      updated_at: string
    }
  }
}

export interface C2SSearchResponse {
  data: Array<{
    id: string
    type: 'customers'
    attributes: C2SCustomerAttributes & {
      created_at: string
      updated_at: string
    }
  }>
  meta?: {
    total: number
    page: number
    per_page: number
  }
}

/**
 * C2S API Service
 * Uses JSON:API format with application/vnd.api+json content type
 */
export class C2SService {
  private readonly token: string
  private readonly baseUrl: string

  constructor() {
    const config = getConfig()
    this.token = config.C2S_TOKEN
    this.baseUrl = config.C2S_URL
  }

  private getHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
    }
  }

  async createCustomer(attributes: C2SCustomerAttributes): Promise<C2SCustomerResponse> {
    c2sLogger.info({ name: attributes.name, phone: attributes.phone }, 'Creating customer in C2S')

    const payload: C2SCustomerRequest = {
      data: {
        type: 'customers',
        attributes,
      },
    }

    try {
      const response = await fetch(`${this.baseUrl}/customers`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        c2sLogger.error({ status: response.status, body: errorBody }, 'Failed to create customer in C2S')
        throw new Error(`C2S returned ${response.status}: ${errorBody}`)
      }

      const data = (await response.json()) as C2SCustomerResponse
      c2sLogger.info({ customerId: data.data.id, name: attributes.name }, 'Successfully created customer in C2S')

      return data
    } catch (error) {
      c2sLogger.error({ error, attributes }, 'Failed to create customer in C2S')
      throw AppError.serviceUnavailable('C2S')
    }
  }

  async updateCustomer(customerId: string, attributes: Partial<C2SCustomerAttributes>): Promise<C2SCustomerResponse> {
    c2sLogger.info({ customerId }, 'Updating customer in C2S')

    const payload = {
      data: {
        type: 'customers',
        id: customerId,
        attributes,
      },
    }

    try {
      const response = await fetch(`${this.baseUrl}/customers/${customerId}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        c2sLogger.error({ status: response.status, body: errorBody }, 'Failed to update customer in C2S')
        throw new Error(`C2S returned ${response.status}: ${errorBody}`)
      }

      const data = (await response.json()) as C2SCustomerResponse
      c2sLogger.info({ customerId }, 'Successfully updated customer in C2S')

      return data
    } catch (error) {
      c2sLogger.error({ error, customerId }, 'Failed to update customer in C2S')
      throw AppError.serviceUnavailable('C2S')
    }
  }

  async findCustomerByPhone(phone: string): Promise<C2SCustomerResponse['data'] | null> {
    c2sLogger.debug({ phone }, 'Searching for customer by phone in C2S')

    try {
      const response = await fetch(`${this.baseUrl}/customers?filter[phone]=${encodeURIComponent(phone)}`, {
        method: 'GET',
        headers: this.getHeaders(),
      })

      if (!response.ok) {
        if (response.status === 404) {
          return null
        }
        throw new Error(`C2S returned ${response.status}`)
      }

      const data = (await response.json()) as C2SSearchResponse

      if (!data.data || data.data.length === 0) {
        return null
      }

      return data.data[0]
    } catch (error) {
      c2sLogger.error({ error, phone }, 'Failed to search customer in C2S')
      throw AppError.serviceUnavailable('C2S')
    }
  }

  async findCustomerByEmail(email: string): Promise<C2SCustomerResponse['data'] | null> {
    c2sLogger.debug({ email }, 'Searching for customer by email in C2S')

    try {
      const response = await fetch(`${this.baseUrl}/customers?filter[email]=${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: this.getHeaders(),
      })

      if (!response.ok) {
        if (response.status === 404) {
          return null
        }
        throw new Error(`C2S returned ${response.status}`)
      }

      const data = (await response.json()) as C2SSearchResponse

      if (!data.data || data.data.length === 0) {
        return null
      }

      return data.data[0]
    } catch (error) {
      c2sLogger.error({ error, email }, 'Failed to search customer in C2S')
      throw AppError.serviceUnavailable('C2S')
    }
  }

  async findCustomerByCpf(cpf: string): Promise<C2SCustomerResponse['data'] | null> {
    c2sLogger.debug({ cpf }, 'Searching for customer by CPF in C2S')

    try {
      const response = await fetch(`${this.baseUrl}/customers?filter[cpf]=${encodeURIComponent(cpf)}`, {
        method: 'GET',
        headers: this.getHeaders(),
      })

      if (!response.ok) {
        if (response.status === 404) {
          return null
        }
        throw new Error(`C2S returned ${response.status}`)
      }

      const data = (await response.json()) as C2SSearchResponse

      if (!data.data || data.data.length === 0) {
        return null
      }

      return data.data[0]
    } catch (error) {
      c2sLogger.error({ error, cpf }, 'Failed to search customer in C2S')
      throw AppError.serviceUnavailable('C2S')
    }
  }
}
