import { describe, expect, test, beforeEach } from 'bun:test'
import { MemoryCache } from '../../src/utils/cache'

describe('MemoryCache', () => {
  let cache: MemoryCache<string>

  beforeEach(() => {
    cache = new MemoryCache({ maxSize: 3, ttlMs: 1000 })
  })

  test('stores and retrieves values', () => {
    cache.set('key1', 'value1')
    expect(cache.get('key1')).toBe('value1')
  })

  test('returns undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined()
  })

  test('checks if key exists', () => {
    cache.set('key1', 'value1')
    expect(cache.has('key1')).toBe(true)
    expect(cache.has('key2')).toBe(false)
  })

  test('deletes values', () => {
    cache.set('key1', 'value1')
    expect(cache.delete('key1')).toBe(true)
    expect(cache.get('key1')).toBeUndefined()
  })

  test('evicts oldest entry when at capacity', () => {
    cache.set('key1', 'value1')
    cache.set('key2', 'value2')
    cache.set('key3', 'value3')
    cache.set('key4', 'value4') // Should evict key1

    expect(cache.get('key1')).toBeUndefined()
    expect(cache.get('key4')).toBe('value4')
  })

  test('expires entries after TTL', async () => {
    const shortCache = new MemoryCache<string>({ maxSize: 10, ttlMs: 50 })
    shortCache.set('key1', 'value1')

    expect(shortCache.get('key1')).toBe('value1')

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(shortCache.get('key1')).toBeUndefined()
  })

  test('clears all entries', () => {
    cache.set('key1', 'value1')
    cache.set('key2', 'value2')
    cache.clear()

    expect(cache.size()).toBe(0)
    expect(cache.get('key1')).toBeUndefined()
  })

  test('prunes expired entries', async () => {
    const shortCache = new MemoryCache<string>({ maxSize: 10, ttlMs: 50 })
    shortCache.set('key1', 'value1')
    shortCache.set('key2', 'value2')

    await new Promise((resolve) => setTimeout(resolve, 100))

    const pruned = shortCache.prune()
    expect(pruned).toBe(2)
    expect(shortCache.size()).toBe(0)
  })
})
