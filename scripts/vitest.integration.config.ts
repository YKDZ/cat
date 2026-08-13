import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 180_000,
    include: ["scripts/**/*.test.ts"],
    reporters: ["agent"],
    silent: "passed-only",
    testTimeout: 180_000,
  },
});
