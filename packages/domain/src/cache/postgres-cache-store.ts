import type { DrizzleClient } from "@cat/db";
import type { JSONType } from "@cat/shared";

import { and, eq, runtimeCacheEntry, sql } from "@cat/db";

import type { CacheStore } from "./types";

const encodeCacheValue = (value: unknown): JSONType => {
  if (value === null) {
    return { __catRuntimeCache: "null" };
  }

  return {
    __catRuntimeCache: "value",
    // oxlint-disable-next-line no-unsafe-type-assertion -- CacheStore persists caller-owned JSON payloads across a generic boundary.
    value: value as JSONType,
  };
};

const decodeCacheValue = <T>(value: JSONType): T | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    // oxlint-disable-next-line no-unsafe-type-assertion -- CacheStore callers decide the requested payload type when reading.
    return value as T;
  }

  const tag = Reflect.get(value, "__catRuntimeCache");
  if (tag === "null") {
    return null;
  }
  if (tag === "value") {
    // oxlint-disable-next-line no-unsafe-type-assertion -- CacheStore callers decide the requested payload type when reading.
    return Reflect.get(value, "value") as T;
  }

  // oxlint-disable-next-line no-unsafe-type-assertion -- CacheStore callers decide the requested payload type when reading.
  return value as T;
};

/**
 * PostgreSQL-backed cache store implementation.
 */
export class PostgresCacheStore implements CacheStore {
  /**
   * Create a PostgreSQL-backed cache store.
   *
   * @param db - Drizzle database client
   * @param namespace - Cache namespace
   */
  public constructor(
    private readonly db: DrizzleClient,
    private readonly namespace = "cache",
  ) {}

  /**
   * Read a cached value and delete it automatically when expired.
   *
   * @param key - Cache key
   * @returns - Cached value, or `null` when missing or expired
   */
  public async get<T>(key: string): Promise<T | null> {
    const [row] = await this.db
      .select()
      .from(runtimeCacheEntry)
      .where(
        and(
          eq(runtimeCacheEntry.namespace, this.namespace),
          eq(runtimeCacheEntry.key, key),
        ),
      )
      .limit(1);

    if (!row) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      await this.delete(key);
      return null;
    }

    await this.db
      .update(runtimeCacheEntry)
      .set({ lastAccessedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(runtimeCacheEntry.namespace, this.namespace),
          eq(runtimeCacheEntry.key, key),
        ),
      );

    return decodeCacheValue<T>(row.value);
  }

  /**
   * Write a cached value with an optional TTL.
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlSeconds - Optional TTL in seconds
   * @returns - No return value
   */
  public async set<T>(
    key: string,
    value: T,
    ttlSeconds?: number,
  ): Promise<void> {
    const now = new Date();
    const expiresAt = ttlSeconds
      ? new Date(now.getTime() + ttlSeconds * 1000)
      : null;

    await this.db
      .insert(runtimeCacheEntry)
      .values({
        namespace: this.namespace,
        key,
        value: encodeCacheValue(value),
        expiresAt,
        lastAccessedAt: now,
      })
      .onConflictDoUpdate({
        target: [runtimeCacheEntry.namespace, runtimeCacheEntry.key],
        set: {
          value: encodeCacheValue(value),
          expiresAt,
          lastAccessedAt: now,
          updatedAt: now,
        },
      });
  }

  /**
   * Delete the specified cache key.
   *
   * @param key - Cache key
   * @returns - No return value
   */
  public async delete(key: string): Promise<void> {
    await this.db
      .delete(runtimeCacheEntry)
      .where(
        and(
          eq(runtimeCacheEntry.namespace, this.namespace),
          eq(runtimeCacheEntry.key, key),
        ),
      );
  }

  /**
   * Check whether a cache key exists and is not expired.
   *
   * @param key - Cache key
   * @returns - Whether the key exists and is valid
   */
  public async has(key: string): Promise<boolean> {
    const [row] = await this.db
      .select({ expiresAt: runtimeCacheEntry.expiresAt })
      .from(runtimeCacheEntry)
      .where(
        and(
          eq(runtimeCacheEntry.namespace, this.namespace),
          eq(runtimeCacheEntry.key, key),
        ),
      )
      .limit(1);

    if (!row) return false;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      await this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clean up expired cache entries for the namespace in batches.
   *
   * @param batchSize - Maximum number of records to clean in one pass
   * @returns - Number of rows actually deleted
   */
  public async cleanupExpired(batchSize = 500): Promise<number> {
    const result = await this.db.execute<{ key: string }>(sql`
      WITH expired AS (
        SELECT namespace, key
        FROM "RuntimeCacheEntry"
        WHERE namespace = ${this.namespace}
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
        ORDER BY expires_at ASC
        LIMIT ${batchSize}
      )
      DELETE FROM "RuntimeCacheEntry" cache
      USING expired
      WHERE cache.namespace = expired.namespace AND cache.key = expired.key
      RETURNING cache.key
    `);

    return result.rows.length;
  }
}
