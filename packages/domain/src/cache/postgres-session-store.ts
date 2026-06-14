import type { DrizzleClient } from "@cat/db";

import { eq, runtimeSessionEntry, sql } from "@cat/db";

import type { SessionStore } from "./types";

/**
 * PostgreSQL-backed session store implementation.
 */
export class PostgresSessionStore implements SessionStore {
  /**
   * Create a PostgreSQL-backed session store.
   *
   * @param db - Drizzle database client
   */
  public constructor(private readonly db: DrizzleClient) {}

  /**
   * Create or replace a session record with TTL.
   *
   * @param key - Session key
   * @param fields - Session field values
   * @param ttlSeconds - TTL in seconds
   * @returns - No return value
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
   * Read a single field from the session.
   *
   * @param key - Session key
   * @param field - Field name
   * @returns - Field value, or `null` when missing
   */
  public async getField(key: string, field: string): Promise<string | null> {
    const all = await this.getAll(key);
    return all?.[field] ?? null;
  }

  /**
   * Read the whole session and delete it automatically when expired.
   *
   * @param key - Session key
   * @returns - All fields, or `null` when missing or expired
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
   * Destroy the session record.
   *
   * @param key - Session key
   * @returns - No return value
   */
  public async destroy(key: string): Promise<void> {
    await this.db
      .delete(runtimeSessionEntry)
      .where(eq(runtimeSessionEntry.key, key));
  }

  /**
   * Clean up expired session records in batches.
   *
   * @param batchSize - Maximum number of records to clean in one pass
   * @returns - Number of rows actually deleted
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
