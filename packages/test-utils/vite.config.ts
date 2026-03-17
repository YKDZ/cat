import { resolve } from "node:path";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    external: ["@cat/db", "@cat/domain"],
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
      entry: resolve(import.meta.dirname, "src/index.ts"),
      fileName: "index",
      formats: ["es"],
    },
    rolldownOptions: {
      external: ["vitest", "@cat/db", "@cat/domain", "pg", "drizzle-orm"],
    },
  },

  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
    }),
  ],
});
