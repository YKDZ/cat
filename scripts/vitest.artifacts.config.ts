import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    hookTimeout: 180_000,
    include: ["scripts/package-artifacts.test.ts"],
    reporters: ["agent"],
    silent: "passed-only",
    testTimeout: 180_000,
  },
});
