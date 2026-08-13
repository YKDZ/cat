import { sql } from "@cat/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

import { ensureVectorStorageSchema } from "./ensure-vector-storage-schema.cmd.ts";

const currentSchemaName = async (testDb: TestDB): Promise<string> => {
  const result = await testDb.client.execute<{ schemaName: string }>(
    sql`SELECT current_schema() AS "schemaName"`,
  );
  const schemaName = result.rows.at(0)?.schemaName;
  if (schemaName === undefined) throw new Error("Test schema is unavailable");
  return schemaName;
};

describe("ensureVectorStorageSchema database attestation", () => {
  let testDb: TestDB;

  beforeEach(async () => {
    testDb = await setupTestDB();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it("attests the current schema Vector table", async () => {
    await expect(
      ensureVectorStorageSchema({ db: testDb.client }, { dimension: 1024 }),
    ).resolves.toEqual({ events: [], result: undefined });
  });

  it("does not borrow a Vector table from another schema", async () => {
    const schemaName = await currentSchemaName(testDb);
    await testDb.client.execute(sql`DROP TABLE "Vector"`);
    const otherDb = await setupTestDB();
    try {
      const otherSchemaName = await currentSchemaName(otherDb);
      await otherDb.client.execute(sql`DROP TABLE "Vector"`);
      await otherDb.client.execute(
        sql`CREATE TABLE "Vector" ("vector" vector(1536) NOT NULL)`,
      );
      await testDb.client.execute(
        sql`SET search_path TO ${sql.identifier(schemaName)}, ${sql.identifier(otherSchemaName)}, public`,
      );

      await expect(
        ensureVectorStorageSchema({ db: testDb.client }, { dimension: 1024 }),
      ).rejects.toThrow(/Vector schema is missing/);
    } finally {
      await otherDb.cleanup();
    }
  });

  it("rejects a vector relation that is not an ordinary table", async () => {
    await testDb.client.execute(sql`DROP TABLE "Vector"`);
    await testDb.client.execute(
      sql`CREATE VIEW "Vector" AS SELECT ARRAY[1::real]::vector(1024) AS "vector"`,
    );

    await expect(
      ensureVectorStorageSchema({ db: testDb.client }, { dimension: 1024 }),
    ).rejects.toThrow(/Vector schema is missing/);
  });

  it("rejects a prepared table with a non-fixed dimension", async () => {
    await testDb.client.execute(sql`DROP TABLE "Vector"`);
    await testDb.client.execute(
      sql`CREATE TABLE "Vector" ("vector" vector(1536) NOT NULL)`,
    );

    await expect(
      ensureVectorStorageSchema({ db: testDb.client }, { dimension: 1024 }),
    ).rejects.toThrow(/does not match the fixed vector dimension 1024/);
  });
});
