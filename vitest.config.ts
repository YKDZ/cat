import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Load env from app .env (provides DATABASE_URL for integration tests).
// Node 20+ built-in; silently ignored when the file is absent.
try {
  process.loadEnvFile(resolve(import.meta.dirname, "apps/app/.env"));
} catch {
  // ignore — file absent in CI or fresh checkout
}

const deriveTestDatabaseUrl = (): string | undefined => {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return undefined;
  try {
    const url = new URL(databaseUrl);
    if (url.protocol === "postgresql:") url.protocol = "postgres:";
    url.search = "";
    return url.toString();
  } catch {
    return undefined;
  }
};

process.env.TEST_DATABASE_URL ??= deriveTestDatabaseUrl();

const ROOT = import.meta.dirname;
const CI = Boolean(process.env.CI);

/** Produce a `@`-alias pointing to `<pkgRoot>/src` for each project. */
const alias = (pkgRoot: string) => [
  { find: "@", replacement: resolve(pkgRoot, "src") },
];

export default defineConfig({
  root: ROOT,
  test: {
    reporters: CI
      ? ["verbose", ["json", { outputFile: "test-results.json" }]]
      : ["verbose"],

    projects: [
      // ── 底层包：纯单元测试（无 DB 依赖）──────────────────────────────
      {
        test: {
          name: "unit-shared",
          include: ["packages/shared/src/**/*.{spec,test}.ts"],
          environment: "node",
        },
        resolve: { alias: alias(resolve(ROOT, "packages/shared")) },
      },
      {
        test: {
          name: "unit-plugin-core",
          include: ["packages/plugin-core/src/**/*.spec.ts"],
          environment: "node",
        },
        resolve: { alias: alias(resolve(ROOT, "packages/plugin-core")) },
      },
      {
        test: {
          name: "unit-db",
          include: ["packages/db/src/**/*.{spec,test}.ts"],
          environment: "node",
        },
        resolve: { alias: alias(resolve(ROOT, "packages/db")) },
      },

      // ── 中间层：按命名区分单测 / 集成测试 ──────────────────────────────
      {
        test: {
          name: "domain",
          include: ["packages/domain/src/**/*.{spec,test}.ts"],
          environment: "node",
          retry: CI ? 3 : 0,
          passWithNoTests: true,
        },
        resolve: { alias: alias(resolve(ROOT, "packages/domain")) },
      },
      {
        test: {
          name: "operations",
          include: ["packages/operations/src/**/*.{spec,test}.ts"],
          environment: "node",
          passWithNoTests: true,
        },
        resolve: { alias: alias(resolve(ROOT, "packages/operations")) },
      },

      // ── 应用层 ──────────────────────────────────────────────────────
      {
        test: {
          name: "app-agent",
          include: ["apps/app-agent/src/**/*.{spec,test}.ts"],
          environment: "node",
          retry: CI ? 3 : 0,
        },
        resolve: { alias: alias(resolve(ROOT, "apps/app-agent")) },
      },
      {
        test: {
          name: "app-api",
          include: ["apps/app-api/src/**/*.{spec,test}.ts"],
          environment: "node",
          passWithNoTests: true,
        },
        resolve: { alias: alias(resolve(ROOT, "apps/app-api")) },
      },
    ],
  },
});
