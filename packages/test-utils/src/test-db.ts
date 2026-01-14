import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { combinedSchema, type DrizzleDB } from "@cat/db";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type TestDB = DrizzleDB & { cleanup: () => Promise<void> };

/**
 * 向 globalThis 填充基于 NodePg 的测试数据库
 * 并完成迁移
 */
export const setupTestDB = async (): Promise<TestDB> => {
  const connectionString =
    process.env.TEST_DATABASE_URL || "postgres://user:pass@localhost:5432/cat";

  const client = new Client({ connectionString });
  await client.connect();

  // Ensure vector extension is installed in public schema
  // CI 并行跑多个测试进程时可能会同时执行 CREATE EXTENSION，导致唯一约束冲突
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector SCHEMA public");
  } catch (err: unknown) {
    const pgError = err as { code?: string };
    // 23505: duplicate key (并发创建), 42710: duplicate_object
    if (pgError.code !== "23505" && pgError.code !== "42710") {
      throw err;
    }
  }
  try {
    await client.query("ALTER EXTENSION vector SET SCHEMA public");
  } catch {
    // Ignore
  }

  const schemaName = `test_${randomUUID().replace(/-/g, "_")}`;
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  // Include public in search_path so that extensions installed in public (like vector) are visible
  await client.query(`SET search_path TO "${schemaName}", public`);

  const db = drizzle({
    client,
    schema: combinedSchema,
    casing: "snake_case",
  });

  const migrationsFolder = path.resolve(__dirname, "../../db/drizzle");

  try {
    await migrate(db, { migrationsFolder, migrationsSchema: schemaName });
  } catch (e) {
    console.error("Migration failed:", e);
    throw e;
  }

  // Manually create Vector table for testing since it was removed from production schema
  // but TestVectorStorage still relies on it.
  await client.query(`
    CREATE TABLE "${schemaName}"."Vector" (
      "id" serial PRIMARY KEY,
      "vector" vector(1024) NOT NULL,
      "chunk_id" integer NOT NULL REFERENCES "${schemaName}"."Chunk"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE INDEX "embeddingIndex" ON "${schemaName}"."Vector" USING hnsw ("vector" vector_cosine_ops);
  `);

  const drizzleDB = {
    client: db,
    connect: async () => {},
    disconnect: async () => {
      // 这里的 disconnect 会被应用逻辑调用，如果是真实环境应该断开连接
      // 但在测试环境中，我们需要保持连接直到 cleanup 被调用
    },
    ping: async () => {
      await client.query("SELECT 1");
    },
  } as unknown as DrizzleDB;

  globalThis["__DRIZZLE_DB__"] = drizzleDB;

  const cleanup = async () => {
    try {
      await client.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    } catch (e) {
      console.error(`Failed to cleanup schema ${schemaName}`, e);
    } finally {
      await client.end();
    }
  };

  return { ...drizzleDB, cleanup } as unknown as TestDB;
};
