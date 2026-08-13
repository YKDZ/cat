import { Pool } from "pg";

import { prepareDatabaseCapabilities } from "./database-capabilities.ts";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === "") {
  throw new Error(
    "DATABASE_URL is required for database capability preparation",
  );
}

const pool = new Pool({ connectionString: databaseUrl });
try {
  await pool.query("SELECT 1");
  await prepareDatabaseCapabilities(pool);
} finally {
  await pool.end();
}
