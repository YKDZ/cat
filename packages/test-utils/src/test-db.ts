import { randomUUID } from "node:crypto";

import * as dbExports from "@cat/db";
import { relations, type DrizzleDB } from "@cat/db";
import {
  generateDrizzleJson,
  generateMigration,
} from "drizzle-kit/api-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";

export type TestDB = DrizzleDB & {
  cleanup: () => Promise<void>;
  openConcurrentClient: () => Promise<{
    client: DrizzleDB["client"];
    cleanup: () => Promise<void>;
  }>;
};

/** Create a migrated NodePg test database and register it for test consumers. */
export const setupTestDB = async (): Promise<TestDB> => {
  const connectionString =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgres://user:pass@localhost:5432/cat";

  const client = new Client({ connectionString });
  await client.connect();

  // Ensure vector extension is installed in public schema
  // Parallel test processes can race extension creation and violate its catalog uniqueness constraint.
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector SCHEMA public");
  } catch (err: unknown) {
    // oxlint-disable-next-line no-unsafe-type-assertion
    const pgError = err as { code?: string };
    // 23505 is a concurrent catalog insert; 42710 means the extension already exists.
    if (pgError.code !== "23505" && pgError.code !== "42710") {
      throw err;
    }
  }
  try {
    await client.query("ALTER EXTENSION vector SET SCHEMA public");
  } catch {
    // Ignore
  }

  // Ensure pg_trgm extension is installed in public schema (for ILIKE GIN indexes)
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public");
  } catch (err: unknown) {
    // oxlint-disable-next-line no-unsafe-type-assertion
    const pgError = err as { code?: string };
    if (pgError.code !== "23505" && pgError.code !== "42710") {
      throw err;
    }
  }
  try {
    await client.query("ALTER EXTENSION pg_trgm SET SCHEMA public");
  } catch {
    // Ignore
  }

  const schemaName = `test_${randomUUID().replace(/-/g, "_")}`;
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  // Include public in search_path so that extensions installed in public are visible
  await client.query(`SET search_path TO "${schemaName}", public`);
  const db = drizzle({
    client,
    relations,
  });

  const emptySnapshot = await generateDrizzleJson({});
  const curSnapshot = await generateDrizzleJson(
    dbExports as Record<string, unknown>,
  );
  const sqlStatements = await generateMigration(emptySnapshot, curSnapshot);
  await client.query(sqlStatements.join("\n"));

  // Manually create Vector table for testing since it was removed from production schema
  // but TestVectorStorage still relies on it.
  await client.query(`
    CREATE TABLE "${schemaName}"."Vector" (
      "id" serial PRIMARY KEY,
      "vector" vector(1024) NOT NULL,
      "chunk_id" integer NOT NULL REFERENCES "${schemaName}"."Chunk"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE INDEX "embeddingIndex" ON "${schemaName}"."Vector" USING hnsw ("vector" vector_cosine_ops);
    CREATE UNIQUE INDEX "Vector_chunkId_unique" ON "${schemaName}"."Vector" ("chunk_id");
  `);

  // oxlint-disable-next-line no-unsafe-type-assertion
  const drizzleDB = {
    client: db,
    connect: async () => {
      /* noop: connection is managed by pg Client */
    },
    disconnect: async () => {
      // Keep the shared client open until test cleanup owns the connection lifecycle.
    },
    ping: async () => {
      await client.query("SELECT 1");
    },
  } as unknown as DrizzleDB;

  const openConcurrentClient = async (): Promise<{
    client: DrizzleDB["client"];
    cleanup: () => Promise<void>;
  }> => {
    const concurrent = new Client({ connectionString });
    await concurrent.connect();
    await concurrent.query(`SET search_path TO "${schemaName}", public`);
    return {
      client: drizzle({
        client: concurrent,
        relations,
      }) as unknown as DrizzleDB["client"],
      cleanup: async () => {
        await concurrent.end();
      },
    };
  };

  globalThis["__DRIZZLE_DB__"] = drizzleDB;

  const cleanup = async () => {
    // Do not leave later tests with a closed shared client.
    if (globalThis["__DRIZZLE_DB__"] === drizzleDB) {
      globalThis["__DRIZZLE_DB__"] = undefined;
    }
    try {
      await client.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    } finally {
      await client.end();
    }
  };

  // oxlint-disable-next-line typescript/no-misused-spread, no-unsafe-type-assertion
  return { ...drizzleDB, cleanup, openConcurrentClient } as unknown as TestDB;
};
