import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    external: ["@cat/plugin-core", "@cat/shared", "@cat/db", "@cat/server-shared", "zod"],
  },

  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  build: {
    ssr: true,
    emptyOutDir: true,
    rollupOptions: {
      external: ["@cat/plugin-core", "@cat/shared", "@cat/db", "@cat/server-shared", "zod"],
    },

    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      formats: ["es"],
      fileName: `index.js`,
    },
  },
});
