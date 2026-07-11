import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 180_000,
    reporters: ["agent"],
    silent: "passed-only",
    include: ["scripts/**/*.spec.ts", "tooling/oxlint/**/*.spec.ts"],
    testTimeout: 180_000,
  },
});
