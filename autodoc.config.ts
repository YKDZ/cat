import { defineConfig } from "@tools/autodoc";

export default defineConfig({
  packages: [
    {
      path: "packages/domain",
      name: "@cat/domain",
      priority: "high",
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.spec.ts"],
    },
    {
      path: "packages/operations",
      name: "@cat/operations",
      priority: "high",
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.spec.ts"],
    },
    { path: "packages/shared", name: "@cat/shared", priority: "medium" },
    { path: "packages/db", name: "@cat/db", priority: "medium" },
    {
      path: "packages/permissions",
      name: "@cat/permissions",
      priority: "medium",
    },
    { path: "packages/workflow", name: "@cat/workflow", priority: "medium" },
    {
      path: "packages/server-shared",
      name: "@cat/server-shared",
      priority: "medium",
    },
    {
      path: "packages/plugin-core",
      name: "@cat/plugin-core",
      priority: "medium",
    },
    {
      path: "packages/auth",
      name: "@cat/auth",
      priority: "medium",
    },
    {
      path: "packages/core",
      name: "@cat/core",
      priority: "medium",
    },
    {
      path: "packages/message",
      name: "@cat/message",
      priority: "medium",
    },
    {
      path: "packages/graph",
      name: "@cat/graph",
      priority: "medium",
    },
  ],
  output: {
    path: "apps/docs/src/autodoc",
    format: "markdown",
  },
  llmsTxt: {
    enabled: true,
  },
});
