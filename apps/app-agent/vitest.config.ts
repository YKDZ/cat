import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

loadDotEnv({
  path: resolve(import.meta.dirname, "../app/.env"),
  override: false,
});

const deriveTestDatabaseUrl = (): string | undefined => {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return undefined;
  }

  try {
    const url = new URL(databaseUrl);

    if (url.protocol === "postgresql:") {
      url.protocol = "postgres:";
    }

    url.search = "";
    return url.toString();
  } catch {
    return undefined;
  }
};

process.env.TEST_DATABASE_URL ??= deriveTestDatabaseUrl();

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    retry: process.env.CI ? 3 : 0,
  },
});
