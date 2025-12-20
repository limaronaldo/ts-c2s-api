/**
 * Redis Cache Implementation
 *
 * Provides a Redis-backed cache with automatic fallback to in-memory cache.
 * Used for multi-instance deployments where cache sharing is needed.
 *
 * Features:
 * - Automatic connection handling with reconnection
 * - Graceful fallback to in-memory cache if Redis unavailable
 * - TTL support matching the in-memory cache interface
 * - JSON serialization for complex objects
 */

import Redis from "ioredis";
import { logger } from "./logger";
import { MemoryCache } from "./cache";

const cacheLogger = logger.child({ module: "redis-cache" });

interface CacheOptions {
  maxSize: number;
  ttlMs: number;
  keyPrefix?: string;
}

export interface CacheInterface<T> {
  get(key: string): Promise<T | undefined> | T | undefined;
  set(key: string, value: T): Promise<void> | void;
  has(key: string): Promise<boolean> | boolean;
  delete(key: string): Promise<boolean> | boolean;
  clear(): Promise<void> | void;
}

let redisClient: Redis | null = null;
let redisConnected = false;

/**
 * Initialize Redis connection
 */
export function initRedis(url: string): Redis {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) {
        cacheLogger.warn("Redis connection failed after 5 retries, giving up");
        return null; // Stop retrying
      }
      const delay = Math.min(times * 200, 2000);
      return delay;
    },
    lazyConnect: true,
  });

  redisClient.on("connect", () => {
    redisConnected = true;
    cacheLogger.info("Redis connected");
  });

  redisClient.on("error", (err) => {
    redisConnected = false;
    cacheLogger.error({ error: err.message }, "Redis connection error");
  });

  redisClient.on("close", () => {
    redisConnected = false;
    cacheLogger.warn("Redis connection closed");
  });

  // Attempt connection
  redisClient.connect().catch((err) => {
    cacheLogger.warn({ error: err.message }, "Failed to connect to Redis, using in-memory cache");
  });

  return redisClient;
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    redisConnected = false;
    cacheLogger.info("Redis connection closed");
  }
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redisConnected && redisClient !== null;
}

/**
 * Redis-backed cache with in-memory fallback
 */
export class RedisCache<T> implements CacheInterface<T> {
  private readonly memoryCache: MemoryCache<T>;
  private readonly ttlSeconds: number;
  private readonly keyPrefix: string;

  constructor(options: CacheOptions) {
    this.memoryCache = new MemoryCache<T>({
      maxSize: options.maxSize,
      ttlMs: options.ttlMs,
    });
    this.ttlSeconds = Math.floor(options.ttlMs / 1000);
    this.keyPrefix = options.keyPrefix || "c2s:";
  }

  private fullKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get(key: string): Promise<T | undefined> {
    // Try Redis first if connected
    if (isRedisConnected() && redisClient) {
      try {
        const value = await redisClient.get(this.fullKey(key));
        if (value !== null) {
          return JSON.parse(value) as T;
        }
        return undefined;
      } catch (err) {
        cacheLogger.debug({ key, error: err }, "Redis get failed, falling back to memory");
      }
    }

    // Fallback to in-memory cache
    return this.memoryCache.get(key);
  }

  async set(key: string, value: T): Promise<void> {
    // Always set in memory cache as fallback
    this.memoryCache.set(key, value);

    // Try Redis if connected
    if (isRedisConnected() && redisClient) {
      try {
        await redisClient.setex(
          this.fullKey(key),
          this.ttlSeconds,
          JSON.stringify(value)
        );
      } catch (err) {
        cacheLogger.debug({ key, error: err }, "Redis set failed");
      }
    }
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== undefined;
  }

  async delete(key: string): Promise<boolean> {
    const memoryDeleted = this.memoryCache.delete(key);

    if (isRedisConnected() && redisClient) {
      try {
        const result = await redisClient.del(this.fullKey(key));
        return result > 0 || memoryDeleted;
      } catch (err) {
        cacheLogger.debug({ key, error: err }, "Redis delete failed");
      }
    }

    return memoryDeleted;
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();

    if (isRedisConnected() && redisClient) {
      try {
        // Use SCAN to find and delete keys with our prefix
        let cursor = "0";
        do {
          const [nextCursor, keys] = await redisClient.scan(
            cursor,
            "MATCH",
            `${this.keyPrefix}*`,
            "COUNT",
            100
          );
          cursor = nextCursor;
          if (keys.length > 0) {
            await redisClient.del(...keys);
          }
        } while (cursor !== "0");
      } catch (err) {
        cacheLogger.debug({ error: err }, "Redis clear failed");
      }
    }
  }

  /**
   * Get sync (memory only) - for backwards compatibility
   */
  getSync(key: string): T | undefined {
    return this.memoryCache.get(key);
  }

  /**
   * Set sync (memory only) - for backwards compatibility
   */
  setSync(key: string, value: T): void {
    this.memoryCache.set(key, value);
  }

  /**
   * Has sync (memory only) - for backwards compatibility
   */
  hasSync(key: string): boolean {
    return this.memoryCache.has(key);
  }
}

/**
 * Create a cache that uses Redis if available, otherwise in-memory
 * This is a factory function that returns the appropriate cache type
 */
export function createCache<T>(options: CacheOptions): RedisCache<T> {
  return new RedisCache<T>(options);
}
