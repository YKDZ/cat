import { Pool } from "pg";

import { prepareVectorRuntimeSchema } from "./database-capabilities.ts";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === "") {
  throw new Error(
    "DATABASE_URL is required for vector runtime schema preparation",
  );
}

const pool = new Pool({ connectionString: databaseUrl });
try {
  await pool.query("SELECT 1");
  await prepareVectorRuntimeSchema(pool);
} finally {
  await pool.end();
}
