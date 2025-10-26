import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "unplugin-dts/vite";

export default defineConfig({
  ssr: {
    external: [
      "@cat/db",
      "@cat/shared",
      "@cat/plugin-core",
      "@cat/app-server-shared",
      "zod",
      "lodash-es",
      "bullmq",
      "dotenv",
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
        workers: resolve(import.meta.dirname, "src/workers/index.ts"),
        utils: resolve(import.meta.dirname, "src/utils/index.ts"),
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
