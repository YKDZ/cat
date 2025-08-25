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
      name: "shared",
      fileName: (format) => `index.${format}` + (format === "es" ? ".js" : ""),
      formats: ["es", "cjs"],
    },
    outDir: "dist",
    rollupOptions: {
      external: [
        "path",
        "fs",
        "vm",
        "module",
        "fs/promises",
        "url",
        "zod",
        "crypto",
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
