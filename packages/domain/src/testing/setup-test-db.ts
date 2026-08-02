import { randomUUID } from "node:crypto";

import * as dbExports from "@cat/db";
import { relations, type DrizzleClient, type DrizzleDB } from "@cat/db";
import {
  generateDrizzleJson,
  generateMigration,
} from "drizzle-kit/api-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";

declare global {
  // oxlint-disable-next-line no-var
  var __DRIZZLE_DB__: DrizzleDB | undefined;
}

export type ConcurrentTestDbClient = {
  client: DrizzleClient;
  cleanup: () => Promise<void>;
};

export type TestDB = DrizzleDB & {
  cleanup: () => Promise<void>;
  openConcurrentClient: () => Promise<ConcurrentTestDbClient>;
};

const getPgErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : undefined;
};

export const setupTestDB = async (): Promise<TestDB> => {
  const connectionString =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgres://user:pass@localhost:5432/cat";

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector SCHEMA public");
  } catch (err: unknown) {
    const code = getPgErrorCode(err);
    if (code !== "23505" && code !== "42710") throw err;
  }
  try {
    await client.query("ALTER EXTENSION vector SET SCHEMA public");
  } catch {
    // already set
  }

  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public");
  } catch (err: unknown) {
    const code = getPgErrorCode(err);
    if (code !== "23505" && code !== "42710") throw err;
  }
  try {
    await client.query("ALTER EXTENSION pg_trgm SET SCHEMA public");
  } catch {
    // already set
  }

  const schemaName = `test_${randomUUID().replace(/-/g, "_")}`;
  await client.query(`CREATE SCHEMA "${schemaName}"`);
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

  // oxlint-disable-next-line no-unsafe-type-assertion
  const drizzleDB = {
    client: db,
    connect: async () => Promise.resolve(),
    disconnect: async () => Promise.resolve(),
    migrate: async () => Promise.resolve(),
    ping: async () => {
      await client.query("SELECT 1");
    },
  } as unknown as DrizzleDB;
  globalThis.__DRIZZLE_DB__ = drizzleDB;

  const openConcurrentClient = async (): Promise<ConcurrentTestDbClient> => {
    const concurrentClient = new Client({ connectionString });
    await concurrentClient.connect();
    await concurrentClient.query(`SET search_path TO "${schemaName}", public`);
    return {
      // DrizzleDB's public client deliberately hides the raw driver client.
      // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
      client: drizzle({ client: concurrentClient, relations }) as DrizzleClient,
      cleanup: async () => await concurrentClient.end(),
    };
  };

  const cleanup = async () => {
    if (globalThis.__DRIZZLE_DB__ === drizzleDB) {
      globalThis.__DRIZZLE_DB__ = undefined;
    }
    try {
      await client.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    } finally {
      await client.end();
    }
  };

  return Object.assign(drizzleDB, { cleanup, openConcurrentClient });
};
