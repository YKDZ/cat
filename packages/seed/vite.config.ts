import { resolve } from "node:path";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  plugins: [
    dts({
      include: ["src/**/*.ts"],
      compilerOptions: {
        declarationMap: true,
      },
    }),
  ],

  build: {
    target: "esnext",
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      fileName: "index",
      formats: ["es"],
    },
    rolldownOptions: {
      external: [
        /^@cat\//,
        /^node:/,
        "better-sqlite3",
        "js-yaml",
        "zod",
        "pg",
        "drizzle-orm",
        "drizzle-orm/node-postgres",
      ],
    },
    sourcemap: true,
  },
});
