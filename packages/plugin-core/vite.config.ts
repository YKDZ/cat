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
    ssr: true,
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
      external: ["@cat/shared", "@cat/db"],
    },
  },
  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
    }),
  ],
});
