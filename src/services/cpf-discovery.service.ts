import { DBaseService } from './dbase.service'
import { MimirService } from './mimir.service'
import { DiretrixService } from './diretrix.service'
import { contactToCpfCache } from '../utils/cache'
import { enrichmentLogger } from '../utils/logger'

/**
 * CPF Discovery Service with 3-tier fallback:
 * 1. DBase (fastest, cheapest)
 * 2. Mimir (Azure IBVI)
 * 3. Diretrix (most comprehensive, most expensive)
 */
export class CpfDiscoveryService {
  private dbaseService: DBaseService
  private mimirService: MimirService
  private diretrixService: DiretrixService

  constructor() {
    this.dbaseService = new DBaseService()
    this.mimirService = new MimirService()
    this.diretrixService = new DiretrixService()
  }

  async findCpfByPhone(phone: string): Promise<string | null> {
    const cacheKey = `phone:${phone}`

    // Check cache first
    const cached = contactToCpfCache.get(cacheKey)
    if (cached) {
      enrichmentLogger.debug({ phone }, 'CPF found in cache')
      return cached
    }

    enrichmentLogger.info({ phone }, 'Starting 3-tier CPF discovery by phone')

    // Tier 1: DBase
    try {
      const cpf = await this.dbaseService.findCpfByPhone(phone)
      if (cpf) {
        enrichmentLogger.info({ phone, cpf, tier: 1, source: 'dbase' }, 'CPF found in DBase')
        contactToCpfCache.set(cacheKey, cpf)
        return cpf
      }
    } catch (error) {
      enrichmentLogger.warn({ phone, error }, 'DBase lookup failed, trying next tier')
    }

    // Tier 2: Mimir
    try {
      const cpf = await this.mimirService.findCpfByPhone(phone)
      if (cpf) {
        enrichmentLogger.info({ phone, cpf, tier: 2, source: 'mimir' }, 'CPF found in Mimir')
        contactToCpfCache.set(cacheKey, cpf)
        return cpf
      }
    } catch (error) {
      enrichmentLogger.warn({ phone, error }, 'Mimir lookup failed, trying next tier')
    }

    // Tier 3: Diretrix
    try {
      const cpf = await this.diretrixService.findCpfByPhone(phone)
      if (cpf) {
        enrichmentLogger.info({ phone, cpf, tier: 3, source: 'diretrix' }, 'CPF found in Diretrix')
        contactToCpfCache.set(cacheKey, cpf)
        return cpf
      }
    } catch (error) {
      enrichmentLogger.warn({ phone, error }, 'Diretrix lookup failed')
    }

    enrichmentLogger.info({ phone }, 'CPF not found in any tier')
    return null
  }

  async findCpfByEmail(email: string): Promise<string | null> {
    const cacheKey = `email:${email}`

    // Check cache first
    const cached = contactToCpfCache.get(cacheKey)
    if (cached) {
      enrichmentLogger.debug({ email }, 'CPF found in cache')
      return cached
    }

    enrichmentLogger.info({ email }, 'Looking up CPF by email')

    // Only Diretrix supports email lookup
    try {
      const cpf = await this.diretrixService.findCpfByEmail(email)
      if (cpf) {
        enrichmentLogger.info({ email, cpf, source: 'diretrix' }, 'CPF found by email')
        contactToCpfCache.set(cacheKey, cpf)
        return cpf
      }
    } catch (error) {
      enrichmentLogger.warn({ email, error }, 'Email lookup failed')
    }

    return null
  }

  async findCpf(phone?: string, email?: string): Promise<string | null> {
    // Try phone first (3-tier fallback)
    if (phone) {
      const cpf = await this.findCpfByPhone(phone)
      if (cpf) return cpf
    }

    // Fall back to email
    if (email) {
      const cpf = await this.findCpfByEmail(email)
      if (cpf) return cpf
    }

    return null
  }
}
