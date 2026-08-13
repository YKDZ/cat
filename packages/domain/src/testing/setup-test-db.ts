// oxlint-disable no-underscore-dangle
import { randomUUID } from "node:crypto";

import * as dbExports from "@cat/db";
import { relations, type DrizzleClient, type DrizzleDB } from "@cat/db";
import {
  prepareDatabaseCapabilities,
  prepareVectorRuntimeSchema,
} from "@cat/db/database-capabilities";
import {
  generateDrizzleJson,
  generateMigration,
} from "drizzle-kit/api-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";

declare global {
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

export const setupTestDB = async (): Promise<TestDB> => {
  const connectionString =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgres://user:pass@localhost:5432/cat";

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await prepareDatabaseCapabilities(client);
  } catch (error) {
    await client.end();
    throw error;
  }

  const schemaName = `test_${randomUUID().replace(/-/g, "_")}`;
  try {
    await client.query(`CREATE SCHEMA "${schemaName}"`);
  } catch (error) {
    await client.end();
    throw error;
  }
  let cleanupAttempt: Promise<void> | undefined;
  let clientClosed = false;
  let schemaDropped = false;
  const cleanupSchema = async (): Promise<void> => {
    if (clientClosed) return;
    if (cleanupAttempt) return await cleanupAttempt;

    const attempt = (async () => {
      if (!schemaDropped) {
        await client.query(`DROP SCHEMA "${schemaName}" CASCADE`);
        schemaDropped = true;
      }
      await client.end();
      clientClosed = true;
    })();
    cleanupAttempt = attempt;
    void attempt.then(
      () => {
        if (cleanupAttempt === attempt) cleanupAttempt = undefined;
        return;
      },
      () => {
        if (cleanupAttempt === attempt) cleanupAttempt = undefined;
      },
    );
    return await attempt;
  };

  let drizzleDB: DrizzleDB;
  try {
    await client.query(`SET search_path TO "${schemaName}", public`);
    const db = drizzle({ client, relations });
    const emptySnapshot = await generateDrizzleJson({});
    const curSnapshot = await generateDrizzleJson(
      dbExports as Record<string, unknown>,
    );
    const sqlStatements = await generateMigration(emptySnapshot, curSnapshot);
    await client.query(sqlStatements.join("\n"));
    await prepareVectorRuntimeSchema(client);

    // oxlint-disable-next-line no-unsafe-type-assertion
    drizzleDB = {
      client: db,
      connect: async () => Promise.resolve(),
      disconnect: async () => Promise.resolve(),
      migrate: async () => Promise.resolve(),
      ping: async () => {
        await client.query("SELECT 1");
      },
    } as unknown as DrizzleDB;
  } catch (error) {
    await cleanupSchema();
    throw error;
  }
  globalThis.__DRIZZLE_DB__ = drizzleDB;

  const openConcurrentClient = async (): Promise<ConcurrentTestDbClient> => {
    const concurrentClient = new Client({ connectionString });
    try {
      await concurrentClient.connect();
      await concurrentClient.query(
        `SET search_path TO "${schemaName}", public`,
      );
    } catch (error) {
      await concurrentClient.end();
      throw error;
    }
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
    await cleanupSchema();
  };

  return Object.assign(drizzleDB, { cleanup, openConcurrentClient });
};
