import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { pushSchema } from "drizzle-kit/api-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm/sql";
import { combinedSchema, type DrizzleDB, type DrizzleSchema } from "@cat/db";

/**
 * 向 globalThis 填充基于 Pglite 的测试数据库\
 * 并完成迁移
 */
export const setupTestDB = async (): Promise<DrizzleDB> => {
  const db = new TestDrizzleDB();
  await db.migrate();
  // @ts-expect-error Pglite cap with NodePg
  globalThis["__DRIZZLE_DB__"] = db;
  return globalThis["__DRIZZLE_DB__"]!;
};

export class TestDrizzleDB {
  public client: PgliteDatabase<DrizzleSchema>;

  constructor() {
    const client = new PGlite({
      extensions: { vector },
    });
    this.client = drizzle({
      client,
      schema: combinedSchema,
      casing: "snake_case",
    });
  }

  async ping(): Promise<void> {
    await this.client.execute(sql`SELECT 1`);
  }

  async migrate(): Promise<void> {
    await this.client.execute(sql`CREATE EXTENSION vector`);

    const { apply } = await pushSchema(
      combinedSchema,
      // oxlint-disable-next-line no-explicit-any no-unsafe-type-assertion
      this.client as unknown as PgDatabase<any>,
      "snake_case",
    );

    await apply();
  }
}
