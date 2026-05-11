import { relations, type DrizzleDB } from "@cat/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

declare global {
  // oxlint-disable-next-line no-var
  var __DRIZZLE_DB__: DrizzleDB | undefined;
}

export type TestDB = DrizzleDB & { cleanup: () => Promise<void> };

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

  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS rum SCHEMA public");
  } catch (err: unknown) {
    const code = getPgErrorCode(err);
    if (code !== "23505" && code !== "42710") throw err;
  }
  try {
    await client.query("ALTER EXTENSION rum SET SCHEMA public");
  } catch {
    // already set
  }

  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS zhparser SCHEMA public");
  } catch (err: unknown) {
    const code = getPgErrorCode(err);
    if (code !== "23505" && code !== "42710") throw err;
  }
  try {
    await client.query("ALTER EXTENSION zhparser SET SCHEMA public");
  } catch {
    // already set
  }

  const schemaName = `test_${randomUUID().replace(/-/g, "_")}`;
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  await client.query(`SET search_path TO "${schemaName}", public`);
  await client.query(`
    DO $$
    DECLARE
      current_schema_name text := current_schema();
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_ts_config cfg
        JOIN pg_namespace ns ON ns.oid = cfg.cfgnamespace
        WHERE cfg.cfgname = 'cat_zh_hans'
          AND ns.nspname = current_schema_name
      ) THEN
        EXECUTE format(
          'CREATE TEXT SEARCH CONFIGURATION %I.cat_zh_hans (PARSER = zhparser)',
          current_schema_name
        );
        EXECUTE format(
          'ALTER TEXT SEARCH CONFIGURATION %I.cat_zh_hans ADD MAPPING FOR n, v, a, i, e, l WITH simple',
          current_schema_name
        );
      END IF;
    END
    $$;
  `);

  const db = drizzle({
    client,
    relations,
  });
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../../../../packages/db/drizzle"),
    migrationsSchema: schemaName,
  });

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

  const cleanup = async () => {
    if (globalThis.__DRIZZLE_DB__ === drizzleDB) {
      delete globalThis.__DRIZZLE_DB__;
    }
    try {
      await client.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    } finally {
      await client.end();
    }
  };

  return Object.assign(drizzleDB, { cleanup });
};
