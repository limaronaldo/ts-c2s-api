interface CacheOptions {
  maxSize: number
  ttlMs: number
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

/**
 * Simple in-memory cache with TTL and max size
 * Matches the Moka cache configuration from Rust implementation
 */
export class MemoryCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map()
  private readonly maxSize: number
  private readonly ttlMs: number

  constructor(options: CacheOptions) {
    this.maxSize = options.maxSize
    this.ttlMs = options.ttlMs
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return undefined
    }

    return entry.value
  }

  set(key: string, value: T): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    })
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }

  // Cleanup expired entries
  prune(): number {
    const now = Date.now()
    let pruned = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
        pruned++
      }
    }

    return pruned
  }
}

// Cache instances matching Rust Moka configuration
// Recent CPF cache - prevents re-processing same CPF within 1 hour
export const recentCpfCache = new MemoryCache<boolean>({
  maxSize: 10_000,
  ttlMs: 60 * 60 * 1000, // 1 hour
})

// Processing leads cache - prevents concurrent processing of same lead
export const processingLeadsCache = new MemoryCache<boolean>({
  maxSize: 1_000,
  ttlMs: 5 * 60 * 1000, // 5 minutes
})

// Contact to CPF cache - caches phone/email to CPF mapping
export const contactToCpfCache = new MemoryCache<string>({
  maxSize: 50_000,
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
})

// Work API response cache
export const workApiCache = new MemoryCache<unknown>({
  maxSize: 10_000,
  ttlMs: 60 * 60 * 1000, // 1 hour
})
