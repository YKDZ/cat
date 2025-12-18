import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    external: ["@cat/shared", "@cat/db", "@cat/plugin-core", "zod"],
    noExternal: ["@elastic/elasticsearch"],
  },

  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  build: {
    ssr: true,
    emptyOutDir: true,

    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      formats: ["es"],
      fileName: `index.js`,
    },
  },
});
