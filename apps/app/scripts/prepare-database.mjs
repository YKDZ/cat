import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { assertDatabaseRequirements } from "./database-requirements.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for preparation");
const migrationsFolder = process.env.DRIZZLE_MIGRATIONS ?? "/app/drizzle";
const pool = new Pool({ connectionString: databaseUrl });
try {
  const db = drizzle({ client: pool });
  await db.execute(sql`select 1`);
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  await migrate(db, { migrationsFolder });
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "Vector" (
      "id" serial PRIMARY KEY,
      "vector" vector(1024) NOT NULL,
      "chunk_id" integer NOT NULL REFERENCES "Chunk"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "embeddingIndex" ON "Vector" USING hnsw ("vector" vector_cosine_ops)
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "Vector_chunkId_unique" ON "Vector" ("chunk_id")
  `);
  await assertDatabaseRequirements({
    execute: async (statement) => {
      const result = await db.execute(sql.raw(statement));
      return { rows: result.rows };
    },
  });
} finally {
  await pool.end();
}
