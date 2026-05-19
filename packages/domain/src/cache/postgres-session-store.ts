import type { DrizzleClient } from "@cat/db";

import { eq, runtimeSessionEntry, sql } from "@cat/db";

import type { SessionStore } from "./types";

/**
 * @zh 基于 PostgreSQL 的会话存储实现。
 * @en PostgreSQL-backed session store implementation.
 */
export class PostgresSessionStore implements SessionStore {
  /**
   * @zh 创建一个 PostgreSQL 会话存储。
   * @en Create a PostgreSQL-backed session store.
   *
   * @param db - {@zh Drizzle 数据库客户端} {@en Drizzle database client}
   */
  public constructor(private readonly db: DrizzleClient) {}

  /**
   * @zh 创建或覆盖一个带 TTL 的会话记录。
   * @en Create or replace a session record with TTL.
   *
   * @param key - {@zh 会话键} {@en Session key}
   * @param fields - {@zh 会话字段值} {@en Session field values}
   * @param ttlSeconds - {@zh TTL（秒）} {@en TTL in seconds}
   * @returns - {@zh 无返回值} {@en No return value}
   */
  public async create(
    key: string,
    fields: Record<string, string | number>,
    ttlSeconds: number,
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const serializedFields = Object.fromEntries(
      Object.entries(fields).map(([field, value]) => [field, String(value)]),
    );

    await this.db
      .insert(runtimeSessionEntry)
      .values({ key, fields: serializedFields, expiresAt })
      .onConflictDoUpdate({
        target: runtimeSessionEntry.key,
        set: {
          fields: serializedFields,
          expiresAt,
          updatedAt: now,
        },
      });
  }

  /**
   * @zh 读取会话中的单个字段。
   * @en Read a single field from the session.
   *
   * @param key - {@zh 会话键} {@en Session key}
   * @param field - {@zh 字段名} {@en Field name}
   * @returns - {@zh 字段值；不存在时为 `null`} {@en Field value, or `null` when missing}
   */
  public async getField(key: string, field: string): Promise<string | null> {
    const all = await this.getAll(key);
    return all?.[field] ?? null;
  }

  /**
   * @zh 读取整个会话；若已过期则自动删除。
   * @en Read the whole session and delete it automatically when expired.
   *
   * @param key - {@zh 会话键} {@en Session key}
   * @returns - {@zh 全部字段；不存在或已过期时为 `null`} {@en All fields, or `null` when missing or expired}
   */
  public async getAll(key: string): Promise<Record<string, string> | null> {
    const [row] = await this.db
      .select()
      .from(runtimeSessionEntry)
      .where(eq(runtimeSessionEntry.key, key))
      .limit(1);

    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) {
      await this.destroy(key);
      return null;
    }

    return row.fields;
  }

  /**
   * @zh 销毁会话记录。
   * @en Destroy the session record.
   *
   * @param key - {@zh 会话键} {@en Session key}
   * @returns - {@zh 无返回值} {@en No return value}
   */
  public async destroy(key: string): Promise<void> {
    await this.db
      .delete(runtimeSessionEntry)
      .where(eq(runtimeSessionEntry.key, key));
  }

  /**
   * @zh 批量清理已过期的会话记录。
   * @en Clean up expired session records in batches.
   *
   * @param batchSize - {@zh 单次清理的最大记录数} {@en Maximum number of records to clean in one pass}
   * @returns - {@zh 实际删除的记录数} {@en Number of rows actually deleted}
   */
  public async cleanupExpired(batchSize = 500): Promise<number> {
    const result = await this.db.execute<{ key: string }>(sql`
      WITH expired AS (
        SELECT key
        FROM "RuntimeSessionEntry"
        WHERE expires_at < NOW()
        ORDER BY expires_at ASC
        LIMIT ${batchSize}
      )
      DELETE FROM "RuntimeSessionEntry" session
      USING expired
      WHERE session.key = expired.key
      RETURNING session.key
    `);

    return result.rows.length;
  }
}
