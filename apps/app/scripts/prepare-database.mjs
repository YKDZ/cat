import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import {
  assertDatabaseRequirements,
  prepareDatabaseCapabilities,
  prepareVectorRuntimeSchema,
} from "./database-requirements.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for preparation");
const migrationsFolder = process.env.DRIZZLE_MIGRATIONS ?? "/app/drizzle";
const pool = new Pool({ connectionString: databaseUrl });
try {
  const db = drizzle({ client: pool });
  await db.execute(sql`select 1`);
  await prepareDatabaseCapabilities(pool);
  await migrate(db, { migrationsFolder });
  await prepareVectorRuntimeSchema(pool);
  await assertDatabaseRequirements({
    execute: async (statement) => {
      const result = await db.execute(sql.raw(statement));
      return { rows: result.rows };
    },
  });
} finally {
  await pool.end();
}
