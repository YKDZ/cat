import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    external: ["zod", "vue", "dompurify", "@cat/plugin-core"],
    noExternal: [/^@cat\//],
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
    minify: false,
    rolldownOptions: {
      external: ["zod", "vue", "dompurify"],
    },

    lib: {
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        client: resolve(import.meta.dirname, "src/client/index.ts"),
      },
      formats: ["es"],
    },
  },
});
