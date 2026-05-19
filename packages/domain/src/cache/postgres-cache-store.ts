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
 * @zh 基于 PostgreSQL 的缓存存储实现。
 * @en PostgreSQL-backed cache store implementation.
 */
export class PostgresCacheStore implements CacheStore {
  /**
   * @zh 创建一个 PostgreSQL 缓存存储。
   * @en Create a PostgreSQL-backed cache store.
   *
   * @param db - {@zh Drizzle 数据库客户端} {@en Drizzle database client}
   * @param namespace - {@zh 缓存命名空间} {@en Cache namespace}
   */
  public constructor(
    private readonly db: DrizzleClient,
    private readonly namespace = "cache",
  ) {}

  /**
   * @zh 读取缓存值；若记录已过期则自动删除。
   * @en Read a cached value and delete it automatically when expired.
   *
   * @param key - {@zh 缓存键} {@en Cache key}
   * @returns - {@zh 缓存值；不存在或已过期时为 `null`} {@en Cached value, or `null` when missing or expired}
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
   * @zh 写入缓存值并可选设置 TTL。
   * @en Write a cached value with an optional TTL.
   *
   * @param key - {@zh 缓存键} {@en Cache key}
   * @param value - {@zh 要缓存的值} {@en Value to cache}
   * @param ttlSeconds - {@zh 可选 TTL（秒）} {@en Optional TTL in seconds}
   * @returns - {@zh 无返回值} {@en No return value}
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
   * @zh 删除指定缓存键。
   * @en Delete the specified cache key.
   *
   * @param key - {@zh 缓存键} {@en Cache key}
   * @returns - {@zh 无返回值} {@en No return value}
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
   * @zh 检查缓存键是否存在且未过期。
   * @en Check whether a cache key exists and is not expired.
   *
   * @param key - {@zh 缓存键} {@en Cache key}
   * @returns - {@zh 键是否存在且有效} {@en Whether the key exists and is valid}
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
   * @zh 批量清理命名空间中已过期的缓存项。
   * @en Clean up expired cache entries for the namespace in batches.
   *
   * @param batchSize - {@zh 单次清理的最大记录数} {@en Maximum number of records to clean in one pass}
   * @returns - {@zh 实际删除的记录数} {@en Number of rows actually deleted}
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
