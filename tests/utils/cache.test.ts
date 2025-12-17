/**
 * MemoryCache Unit Tests
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { MemoryCache } from "../../src/utils/cache";

describe("MemoryCache", () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    cache = new MemoryCache<string>({
      maxSize: 100,
      ttlMs: 60000, // 1 minute
    });
  });

  test("sets and gets a value", () => {
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  test("returns undefined for missing key", () => {
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  test("has() returns true for existing key", () => {
    cache.set("key1", "value1");
    expect(cache.has("key1")).toBe(true);
  });

  test("has() returns false for missing key", () => {
    expect(cache.has("nonexistent")).toBe(false);
  });

  test("delete() removes a key", () => {
    cache.set("key1", "value1");
    expect(cache.delete("key1")).toBe(true);
    expect(cache.get("key1")).toBeUndefined();
  });

  test("delete() returns false for missing key", () => {
    expect(cache.delete("nonexistent")).toBe(false);
  });

  test("clear() removes all entries", () => {
    cache.set("key1", "value1");
    cache.set("key2", "value2");
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  test("size() returns number of entries", () => {
    expect(cache.size()).toBe(0);
    cache.set("key1", "value1");
    expect(cache.size()).toBe(1);
    cache.set("key2", "value2");
    expect(cache.size()).toBe(2);
  });

  test("evicts oldest entry when at capacity", () => {
    const smallCache = new MemoryCache<string>({
      maxSize: 2,
      ttlMs: 60000,
    });

    smallCache.set("key1", "value1");
    smallCache.set("key2", "value2");
    smallCache.set("key3", "value3"); // Should evict key1

    expect(smallCache.get("key1")).toBeUndefined();
    expect(smallCache.get("key2")).toBe("value2");
    expect(smallCache.get("key3")).toBe("value3");
  });

  test("entry expires after TTL", async () => {
    const shortCache = new MemoryCache<string>({
      maxSize: 100,
      ttlMs: 50, // 50ms TTL
    });

    shortCache.set("key1", "value1");
    expect(shortCache.get("key1")).toBe("value1");

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(shortCache.get("key1")).toBeUndefined();
  });

  test("overwrites existing key with new value", () => {
    cache.set("key1", "value1");
    cache.set("key1", "value2");
    expect(cache.get("key1")).toBe("value2");
  });

  test("prune() removes expired entries", async () => {
    const shortCache = new MemoryCache<string>({
      maxSize: 100,
      ttlMs: 50,
    });

    shortCache.set("key1", "value1");
    shortCache.set("key2", "value2");

    await new Promise((resolve) => setTimeout(resolve, 100));

    const pruned = shortCache.prune();
    expect(pruned).toBe(2);
    expect(shortCache.size()).toBe(0);
  });
});
