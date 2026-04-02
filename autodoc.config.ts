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
    { path: "packages/agent", name: "@cat/agent", priority: "medium" },
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
  ],
  output: {
    path: "apps/docs/src/autodoc",
    format: "markdown",
  },
  llmsTxt: {
    enabled: true,
  },
});
