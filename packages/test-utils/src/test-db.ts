import { randomUUID } from "node:crypto";

import * as dbExports from "@cat/db";
import { relations, type DrizzleDB } from "@cat/db";
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
      },
      () => {
        if (cleanupAttempt === attempt) cleanupAttempt = undefined;
      },
    );
    return await attempt;
  };

  let drizzleDB: DrizzleDB;
  try {
    // Include public in search_path so that extensions installed in public are visible.
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
  } catch (error) {
    await cleanupSchema();
    throw error;
  }

  const openConcurrentClient = async (): Promise<{
    client: DrizzleDB["client"];
    cleanup: () => Promise<void>;
  }> => {
    const concurrent = new Client({ connectionString });
    try {
      await concurrent.connect();
      await concurrent.query(`SET search_path TO "${schemaName}", public`);
    } catch (error) {
      await concurrent.end();
      throw error;
    }
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
    await cleanupSchema();
  };

  // oxlint-disable-next-line typescript/no-misused-spread, no-unsafe-type-assertion
  return { ...drizzleDB, cleanup, openConcurrentClient } as unknown as TestDB;
};
