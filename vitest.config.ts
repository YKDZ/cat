import vue from "@vitejs/plugin-vue";
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
    passWithNoTests: true,
    reporters: CI
      ? ["verbose", ["json", { outputFile: "test-results.json" }]]
      : ["verbose"],

    projects: [
      // ── 底层包：纯单元测试（无 DB 依赖）──────────────────────────────
      {
        test: {
          name: "unit-core",
          include: ["packages/core/src/**/*.{spec,test}.ts"],
          environment: "node",
        },
        resolve: { alias: alias(resolve(ROOT, "packages/core")) },
      },
      {
        test: {
          name: "unit-graph",
          include: ["packages/graph/src/**/*.{spec,test}.ts"],
          environment: "node",
        },
        resolve: { alias: alias(resolve(ROOT, "packages/graph")) },
      },
      {
        test: {
          name: "unit-auth",
          include: ["packages/auth/src/**/*.{spec,test}.ts"],
          environment: "node",
        },
        resolve: { alias: alias(resolve(ROOT, "packages/auth")) },
      },
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
        },
        resolve: { alias: alias(resolve(ROOT, "packages/domain")) },
      },
      {
        test: {
          name: "operations",
          include: ["packages/operations/src/**/*.{spec,test}.ts"],
          environment: "node",
        },
        resolve: { alias: alias(resolve(ROOT, "packages/operations")) },
      },
      {
        test: {
          name: "message",
          include: ["packages/message/src/**/*.{spec,test}.ts"],
          environment: "node",
        },
        resolve: { alias: alias(resolve(ROOT, "packages/message")) },
      },
      {
        test: {
          name: "workflow",
          include: ["packages/workflow/src/**/*.spec.ts"],
          environment: "node",
          retry: CI ? 3 : 0,
        },
        resolve: { alias: alias(resolve(ROOT, "packages/workflow")) },
      },
      {
        test: {
          name: "workflow-integration",
          include: ["packages/workflow/src/**/*.test.ts"],
          environment: "node",
          retry: CI ? 3 : 0,
        },
        resolve: { alias: alias(resolve(ROOT, "packages/workflow")) },
      },

      // ── 应用层 ──────────────────────────────────────────────────────
      {
        test: {
          name: "app-api",
          include: ["apps/app-api/src/**/*.{spec,test}.ts"],
          environment: "node",
        },
        resolve: { alias: alias(resolve(ROOT, "apps/app-api")) },
      },
      {
        test: {
          name: "unit-cli",
          include: ["apps/cli/src/**/*.{spec,test}.ts"],
          environment: "node",
        },
        resolve: { alias: alias(resolve(ROOT, "apps/cli")) },
      },
      {
        test: {
          name: "unit-eval",
          include: ["apps/eval/src/**/*.spec.ts"],
          environment: "node",
        },
        resolve: { alias: alias(resolve(ROOT, "apps/eval")) },
      },

      // ── UI 包：组件单元测试 ──────────────────────────────────────────
      {
        plugins: [vue()],
        test: {
          name: "unit-ui",
          include: ["packages/ui/src/**/*.{spec,test}.ts"],
          environment: "happy-dom",
        },
        resolve: { alias: alias(resolve(ROOT, "packages/ui")) },
      },

      // ── App 前端：工具函数单元测试 ──────────────────────────────────
      {
        plugins: [vue()],
        test: {
          name: "unit-app",
          include: ["apps/app/src/**/*.{spec,test}.ts"],
          environment: "happy-dom",
        },
        resolve: { alias: alias(resolve(ROOT, "apps/app")) },
      },
      // ── oxlint 自定义插件 ────────────────────────────────────────
      {
        test: {
          name: "unit-oxlint-plugin",
          include: ["packages/oxlint-plugin/src/**/*.{spec,test}.ts"],
          environment: "node",
        },
        resolve: { alias: alias(resolve(ROOT, "packages/oxlint-plugin")) },
      },

      // ── 工具包 ────────────────────────────────────────────────────────
      {
        test: {
          name: "unit-autodoc",
          include: ["tools/autodoc/src/**/*.{spec,test}.ts"],
          environment: "node",
        },
        resolve: { alias: alias(resolve(ROOT, "tools/autodoc")) },
      },

      // ── Agent 包 ──────────────────────────────────────────────────────
      {
        test: {
          name: "unit-agent",
          include: ["packages/agent/src/**/*.spec.ts"],
          environment: "node",
        },
        resolve: { alias: alias(resolve(ROOT, "packages/agent")) },
      },
      {
        test: {
          name: "agent-integration",
          include: ["packages/agent/src/**/*.test.ts"],
          environment: "node",
          retry: CI ? 3 : 0,
        },
        resolve: { alias: alias(resolve(ROOT, "packages/agent")) },
      },
      {
        test: {
          name: "unit-agent-tools",
          include: ["packages/agent-tools/src/**/*.spec.ts"],
          environment: "node",
        },
        resolve: { alias: alias(resolve(ROOT, "packages/agent-tools")) },
      },
    ],
  },
});
