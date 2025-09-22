import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "unplugin-dts/vite";

export default defineConfig({
  ssr: {
    external: ["@cat/plugin-core", "@cat/shared", "zod", "lodash-es"],
    noExternal: ["remark-parse", "remark-stringify", "unified"],
  },

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
      formats: ["es"],
      fileName: `index.js`,
    },

    outDir: "dist",
  },

  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
    }),
  ],
});
