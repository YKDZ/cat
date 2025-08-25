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
      formats: ["es"],
      fileName: () => `index.mjs`,
    },

    outDir: "dist",

    rollupOptions: {
      external: ["@cat/plugin-core", "@cat/shared", "path"],
      output: {
        entryFileNames: "[name].mjs",
      },
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
