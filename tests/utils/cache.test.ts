/**
 * Memory Cache Tests
 * TSC-28: Unit tests for cache utilities
 */
import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { MemoryCache } from '../../src/utils/cache'

describe('MemoryCache', () => {
  let cache: MemoryCache<string>

  beforeEach(() => {
    cache = new MemoryCache<string>({
      maxSize: 3,
      ttlMs: 1000, // 1 second for testing
      cleanupIntervalMs: 10000 // Long interval so it doesn't interfere
    })
  })

  afterEach(() => {
    cache.destroy()
  })

  test('sets and gets a value', () => {
    cache.set('key1', 'value1')
    expect(cache.get('key1')).toBe('value1')
  })

  test('returns undefined for missing key', () => {
    expect(cache.get('nonexistent')).toBeUndefined()
  })

  test('has() returns true for existing key', () => {
    cache.set('key1', 'value1')
    expect(cache.has('key1')).toBe(true)
  })

  test('has() returns false for missing key', () => {
    expect(cache.has('nonexistent')).toBe(false)
  })

  test('delete() removes a key', () => {
    cache.set('key1', 'value1')
    expect(cache.delete('key1')).toBe(true)
    expect(cache.get('key1')).toBeUndefined()
  })

  test('delete() returns false for missing key', () => {
    expect(cache.delete('nonexistent')).toBe(false)
  })

  test('clear() removes all entries', () => {
    cache.set('key1', 'value1')
    cache.set('key2', 'value2')
    cache.clear()
    expect(cache.size()).toBe(0)
  })

  test('size() returns number of entries', () => {
    expect(cache.size()).toBe(0)
    cache.set('key1', 'value1')
    expect(cache.size()).toBe(1)
    cache.set('key2', 'value2')
    expect(cache.size()).toBe(2)
  })

  test('evicts oldest entry when at capacity', () => {
    cache.set('key1', 'value1')
    cache.set('key2', 'value2')
    cache.set('key3', 'value3')
    // At capacity (3), adding another should evict key1
    cache.set('key4', 'value4')

    expect(cache.get('key1')).toBeUndefined() // Evicted
    expect(cache.get('key2')).toBe('value2')
    expect(cache.get('key3')).toBe('value3')
    expect(cache.get('key4')).toBe('value4')
    expect(cache.size()).toBe(3)
  })

  test('entry expires after TTL', async () => {
    const shortCache = new MemoryCache<string>({
      maxSize: 10,
      ttlMs: 50, // 50ms TTL
      cleanupIntervalMs: 10000
    })

    shortCache.set('key1', 'value1')
    expect(shortCache.get('key1')).toBe('value1')

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(shortCache.get('key1')).toBeUndefined()
    shortCache.destroy()
  })

  test('custom TTL overrides default', async () => {
    const shortCache = new MemoryCache<string>({
      maxSize: 10,
      ttlMs: 1000, // 1 second default
      cleanupIntervalMs: 10000
    })

    shortCache.set('key1', 'value1', 50) // Custom 50ms TTL
    expect(shortCache.get('key1')).toBe('value1')

    await new Promise(resolve => setTimeout(resolve, 100))

    expect(shortCache.get('key1')).toBeUndefined()
    shortCache.destroy()
  })

  test('overwrites existing key with new value', () => {
    cache.set('key1', 'value1')
    cache.set('key1', 'value2')
    expect(cache.get('key1')).toBe('value2')
  })
})
