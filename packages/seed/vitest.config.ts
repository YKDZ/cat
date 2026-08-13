import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
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
  },
});
