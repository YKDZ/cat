import { defineConfig } from "rolldown-vite";
import { resolve } from "path";
import dts from "unplugin-dts/vite";

export default defineConfig({
  ssr: {
    external: ["@cat/db", "@cat/shared", "zod", "lodash-es"],
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
      fileName: "index.js",
      formats: ["es"],
    },
  },

  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.lib.json"),
    }),
  ],
});
