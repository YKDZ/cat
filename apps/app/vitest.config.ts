import { resolve } from "node:path";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: /^@cat-plugin\/([^/]+)$/,
        replacement: resolve(
          import.meta.dirname,
          "../../@cat-plugin/$1/src/index.ts",
        ),
      },
    ],
    conditions: ["source"],
  },
  test: {
    environment: "happy-dom",
    include: [
      "scripts/**/*.spec.ts",
      "src/**/*.spec.ts",
      "src/**/*.test.ts",
      "src/components/plugin/plugin-component-artifacts.test.ts",
    ],
  },
});
