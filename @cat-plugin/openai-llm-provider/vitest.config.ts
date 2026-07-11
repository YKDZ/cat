import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["source"],
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  ssr: { resolve: { conditions: ["source"] } },
  test: {
    retry: process.env.CI ? 3 : 0,
  },
});
