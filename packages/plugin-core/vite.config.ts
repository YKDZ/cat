import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  build: {
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      formats: ["es", "cjs"],
      fileName: (format, entryName) => {
        return entryName === "index"
          ? format === "es"
            ? "index.es.js"
            : "index.cjs.js"
          : format === "es"
            ? "browser.es.js"
            : "browser.cjs.js";
      },
    },
    outDir: "dist",
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        browser: resolve(import.meta.dirname, "src/index-browser.ts"),
      },
      output: {
        dir: resolve(import.meta.dirname, "dist"),
      },
      external: [
        "path",
        "fs",
        "vm",
        "module",
        "fs/promises",
        "url",
        "zod",
        "module",
        "@cat/shared",
        "@cat/db",
      ],
    },
  },
  plugins: [
    dts({
      outDir: "dist/types",
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
      insertTypesEntry: true,
    }),
  ],
});
