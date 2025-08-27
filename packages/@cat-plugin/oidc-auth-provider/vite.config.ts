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
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => `index.mjs`,
    },

    outDir: "dist",
    emptyOutDir: true,

    rollupOptions: {
      external: [
        "@cat/plugin-core",
        "@cat/shared",
        "@cat/db",
        "node:crypto",
        "zod",
      ],
      output: {
        entryFileNames: "[name].mjs",
      },
    },
  },

  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
    }),
  ],
});
