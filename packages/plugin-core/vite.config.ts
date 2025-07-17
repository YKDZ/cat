import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
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
        index: resolve(__dirname, "src/index.ts"),
        browser: resolve(__dirname, "src/index-browser.ts"),
      },
      output: {
        dir: resolve(__dirname, "dist"),
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
      insertTypesEntry: true,
    }),
  ],
});
