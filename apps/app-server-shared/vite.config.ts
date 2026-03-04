import { resolve } from "node:path";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    external: [
      "@cat/db",
      "@cat/shared",
      "@cat/plugin-core",
      "zod",
      "lodash-es",
      "bullmq",
      "diff",
    ],
  },

  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  build: {
    ssr: true,
    emptyOutDir: true,
    sourcemap: true,

    lib: {
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        utils: resolve(import.meta.dirname, "src/utils/index.ts"),
        cache: resolve(import.meta.dirname, "src/cache/index.ts"),
        operations: resolve(import.meta.dirname, "src/operations/index.ts"),
      },
      formats: ["es"],
    },
  },

  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
    }),
  ],
});
