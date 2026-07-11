import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for preparation");
const migrationsFolder = process.env.DRIZZLE_MIGRATIONS ?? "/app/drizzle";
const pool = new Pool({ connectionString: databaseUrl });
try {
  const db = drizzle({ client: pool });
  await db.execute(sql`select 1`);
  await migrate(db, { migrationsFolder });
} finally {
  await pool.end();
}
