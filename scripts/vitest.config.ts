import { defineConfig } from "vitest/config";

export const toolingTestIncludes = [
  "scripts/**/*.spec.ts",
  "tooling/oxlint/**/*.spec.ts",
] as const;

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 180_000,
    reporters: ["agent"],
    silent: "passed-only",
    include: [...toolingTestIncludes],
    testTimeout: 180_000,
  },
});
