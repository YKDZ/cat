import { resolve } from "node:path";

import { defineConfig } from "drizzle-kit";

try {
  if (!process.env.DATABASE_URL) {
    process.loadEnvFile(resolve(import.meta.dirname, "../../apps/app/.env"));
  }
} catch {
  // ignore — file absent in CI or fresh checkout
}

try {
  if (!process.env.DATABASE_URL) {
    process.loadEnvFile(resolve(import.meta.dirname, ".env"));
  }
} catch {
  // ignore — file absent in CI or fresh checkout
}

// oxlint-disable-next-line no-unsafe-member-access
if (!process.env.DATABASE_URL) {
  throw new Error("Drizzle need DATABASE_URL environment variable");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/drizzle/schema/",

  dbCredentials: {
    // oxlint-disable-next-line no-unsafe-member-access
    url: process.env.DATABASE_URL,
    ssl: false,
  },

  schemaFilter: ["public"],
  // Vector DDL is prepared explicitly because pgvector is supplied by the database runtime.
  tablesFilter: ["!Vector"],

  verbose: true,
  strict: true,
});
