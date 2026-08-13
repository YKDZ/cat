import { assessDatabaseRequirements } from "@cat/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupTestDB, type TestDB } from "./test-db.ts";

const assess = async (database: TestDB) =>
  await assessDatabaseRequirements({
    execute: async (statement, options = {}) => {
      options.signal?.throwIfAborted();
      const query = {
        text: statement,
        ...(options.timeoutMs === undefined
          ? {}
          : { query_timeout: options.timeoutMs }),
      };
      const result = await database.client.$client.query(query);
      options.signal?.throwIfAborted();
      return { rows: result.rows };
    },
  });

const recreateVector = async (database: TestDB, foreignKey: string) => {
  await database.client.$client.query(`DROP TABLE "Vector"`);
  await database.client.$client.query(`
    CREATE TABLE "Vector" (
      "id" serial PRIMARY KEY,
      "vector" vector(1024) NOT NULL,
      "chunk_id" integer NOT NULL ${foreignKey}
    );
    CREATE INDEX "embeddingIndex" ON "Vector" USING hnsw ("vector" vector_cosine_ops);
    CREATE UNIQUE INDEX "Vector_chunkId_unique" ON "Vector" ("chunk_id");
  `);
};

describe("database requirement assessment", () => {
  let database: TestDB;

  beforeAll(async () => {
    database = await setupTestDB();
  });

  afterAll(async () => {
    await database?.cleanup();
  });

  it("attests a real prepared PostgreSQL vector and trigram schema", async () => {
    const assessment = await assess(database);

    expect(assessment.requirements).toEqual([
      { id: "POSTGRESQL_CORE", status: "SATISFIED" },
      { id: "POSTGRESQL_TRIGRAM_MATCHING", status: "SATISFIED" },
      { id: "POSTGRESQL_VECTOR_STORAGE", status: "SATISFIED" },
    ]);
  });

  it("blocks Vector foreign keys that reference another Chunk column", async () => {
    await database.client.$client.query(`
      ALTER TABLE "Chunk" ADD COLUMN "database_requirement_probe_key" integer;
      ALTER TABLE "Chunk" ADD UNIQUE ("database_requirement_probe_key");
    `);
    await recreateVector(
      database,
      'REFERENCES "Chunk"("database_requirement_probe_key") ON DELETE CASCADE ON UPDATE CASCADE',
    );

    await expect(assess(database)).resolves.toMatchObject({
      requirements: expect.arrayContaining([
        {
          blocker: { reason: "REQUIRED_SCHEMA_INVALID" },
          id: "POSTGRESQL_VECTOR_STORAGE",
          status: "BLOCKED",
        },
      ]),
    });
  });

  it("blocks Vector foreign keys without both cascade actions", async () => {
    await recreateVector(
      database,
      'REFERENCES "Chunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
    );

    await expect(assess(database)).resolves.toMatchObject({
      requirements: expect.arrayContaining([
        {
          blocker: { reason: "REQUIRED_SCHEMA_INVALID" },
          id: "POSTGRESQL_VECTOR_STORAGE",
          status: "BLOCKED",
        },
      ]),
    });
  });
});
